/**
 * Seed script — populates the database with diseases, symptoms, and sf-idf weights
 * from the Kaggle "Disease Prediction Based on Symptoms" dataset.
 *
 * Usage:
 *   1. Download the dataset from:
 *      https://www.kaggle.com/datasets/itachi9604/disease-symptom-dataset
 *   2. Place the CSV file(s) at: medseek-backend/data/kaggle/dataset.csv
 *      (The main file is typically named "dataset.csv" or "Training.csv")
 *   3. Run: npm run seed
 *
 * The script is idempotent — it truncates all search tables and re-seeds on each run.
 *
 * Dataset format (Kaggle):
 *   Columns: Disease, Symptom_1, Symptom_2, ..., Symptom_17
 *   Each row is a patient case. Symptom columns contain symptom names (underscore-separated)
 *   or are empty if fewer symptoms apply.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { env } from "../src/config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ───────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, "..", "data");
const KAGGLE_DIR = path.join(DATA_DIR, "kaggle");
const SYNONYMS_PATH = path.join(DATA_DIR, "synonyms.json");

// Try common filenames the Kaggle dataset might use
const POSSIBLE_CSV_NAMES = ["dataset.csv", "Training.csv", "training.csv", "Disease_Symptom.csv"];

// ─── Types ───────────────────────────────────────────────────────

interface DiseaseSymptomRecord {
  disease: string;
  symptoms: string[];
}

interface SfIdfWeight {
  disease: string;
  symptom: string;
  weight: number;
}

// ─── CSV Parsing ─────────────────────────────────────────────────

function findCsvFile(): string {
  for (const name of POSSIBLE_CSV_NAMES) {
    const fullPath = path.join(KAGGLE_DIR, name);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // If none of the known names exist, look for any .csv file
  if (fs.existsSync(KAGGLE_DIR)) {
    const files = fs.readdirSync(KAGGLE_DIR).filter((f) => f.endsWith(".csv"));
    if (files.length > 0) {
      return path.join(KAGGLE_DIR, files[0]);
    }
  }

  throw new Error(
    `No CSV file found in ${KAGGLE_DIR}.\n` +
      `Download the Kaggle dataset and place it at: ${KAGGLE_DIR}/dataset.csv\n` +
      `Expected filenames: ${POSSIBLE_CSV_NAMES.join(", ")}`
  );
}

/**
 * Parse the Kaggle CSV into structured records.
 *
 * The CSV has columns: Disease, Symptom_1, Symptom_2, ..., Symptom_17
 * Symptom values are underscore-separated names like "itching", "skin_rash", etc.
 * Some cells may be empty (whitespace only).
 */
function parseCsv(csvPath: string): DiseaseSymptomRecord[] {
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("CSV file appears to be empty or has no data rows");
  }

  // Parse header to find symptom columns
  const header = lines[0].split(",").map((h) => h.trim());
  const diseaseColIndex = header.findIndex(
    (h) => h.toLowerCase() === "disease" || h.toLowerCase() === "prognosis"
  );

  if (diseaseColIndex === -1) {
    throw new Error(
      `Could not find "Disease" or "prognosis" column in CSV header: ${header.join(", ")}`
    );
  }

  const records: DiseaseSymptomRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const disease = cols[diseaseColIndex]?.trim();
    if (!disease) continue;

    const symptoms: string[] = [];
    for (let j = 0; j < cols.length; j++) {
      if (j === diseaseColIndex) continue;
      const symptom = cols[j]?.trim().replace(/\s+/g, "_").toLowerCase();
      if (symptom && symptom !== "") {
        symptoms.push(symptom);
      }
    }

    if (symptoms.length > 0) {
      records.push({ disease: disease.trim(), symptoms });
    }
  }

  console.log(`📄 Parsed ${records.length} patient records from CSV`);
  return records;
}

// ─── sf-idf Weight Computation ───────────────────────────────────

/**
 * Compute sf-idf weights for all (disease, symptom) pairs.
 *
 * sf(s, d) = frequency of symptom s in cases of disease d (normalized by total cases of d)
 * idf(s)   = log(total_diseases / diseases_with_symptom_s)
 * weight   = sf(s, d) * idf(s)
 */
function computeSfIdfWeights(records: DiseaseSymptomRecord[]): SfIdfWeight[] {
  // Group records by disease
  const diseaseRecords = new Map<string, string[][]>();
  for (const record of records) {
    if (!diseaseRecords.has(record.disease)) {
      diseaseRecords.set(record.disease, []);
    }
    diseaseRecords.get(record.disease)!.push(record.symptoms);
  }

  const totalDiseases = diseaseRecords.size;

  // For each symptom, count how many diseases it appears in
  const symptomDiseaseCount = new Map<string, Set<string>>();
  for (const [disease, symptomLists] of diseaseRecords) {
    const uniqueSymptoms = new Set(symptomLists.flat());
    for (const symptom of uniqueSymptoms) {
      if (!symptomDiseaseCount.has(symptom)) {
        symptomDiseaseCount.set(symptom, new Set());
      }
      symptomDiseaseCount.get(symptom)!.add(disease);
    }
  }

  // Compute sf-idf for each (disease, symptom) pair
  const weights: SfIdfWeight[] = [];

  for (const [disease, symptomLists] of diseaseRecords) {
    const totalCasesForDisease = symptomLists.length;

    // Count how often each symptom appears in this disease's cases
    const symptomFrequency = new Map<string, number>();
    for (const symptoms of symptomLists) {
      for (const symptom of symptoms) {
        symptomFrequency.set(symptom, (symptomFrequency.get(symptom) || 0) + 1);
      }
    }

    for (const [symptom, count] of symptomFrequency) {
      const sf = count / totalCasesForDisease;
      const diseasesWithSymptom = symptomDiseaseCount.get(symptom)?.size ?? 1;
      const idf = Math.log(totalDiseases / diseasesWithSymptom);

      weights.push({
        disease,
        symptom,
        weight: sf * idf,
      });
    }
  }

  console.log(`⚖️  Computed ${weights.length} sf-idf weights across ${totalDiseases} diseases`);
  return weights;
}

// ─── Urgency Level Assignment ────────────────────────────────────

/**
 * Assign urgency levels to diseases based on known emergency/high-urgency conditions.
 * This is a simple heuristic — a proper classifier will replace it later.
 */
const EMERGENCY_DISEASES = new Set([
  "heart attack",
  "paralysis (brain hemorrhage)",
  "hepatitis e",
  "hepatitis d",
  "hepatitis c",
  "hepatitis b",
  "aids",
]);

const HIGH_URGENCY_DISEASES = new Set([
  "pneumonia",
  "malaria",
  "dengue",
  "typhoid",
  "tuberculosis",
  "jaundice",
  "hepatitis a",
  "diabetes",
  "chronic cholestasis",
]);

const MODERATE_DISEASES = new Set([
  "urinary tract infection",
  "drug reaction",
  "peptic ulcer diseae",
  "gastroenteritis",
  "bronchial asthma",
  "hypertension",
  "migraine",
  "cervical spondylosis",
  "hypothyroidism",
  "hyperthyroidism",
  "hypoglycemia",
  "osteoarthristis",
  "arthritis",
  "varicose veins",
  "alcoholic hepatitis",
]);

function getUrgencyLevel(disease: string): string {
  const lower = disease.toLowerCase().trim();
  if (EMERGENCY_DISEASES.has(lower)) return "emergency";
  if (HIGH_URGENCY_DISEASES.has(lower)) return "high";
  if (MODERATE_DISEASES.has(lower)) return "moderate";
  return "low";
}

// ─── Database Seeding ────────────────────────────────────────────

async function seed() {
  console.log("\n🌱 MedSeek Seed Script — Phase 1\n");

  // 1. Parse CSV
  const csvPath = findCsvFile();
  console.log(`📂 Using CSV: ${csvPath}`);
  const records = parseCsv(csvPath);

  // 2. Compute sf-idf weights
  const weights = computeSfIdfWeights(records);

  // 3. Extract unique diseases and symptoms
  const uniqueDiseases = [...new Set(records.map((r) => r.disease))];
  const uniqueSymptoms = [...new Set(records.flatMap((r) => r.symptoms))];

  console.log(`🏥 Unique diseases: ${uniqueDiseases.length}`);
  console.log(`🩺 Unique symptoms: ${uniqueSymptoms.length}`);

  // 4. Load synonym map
  let synonymMap: Record<string, string[]> = {};
  if (fs.existsSync(SYNONYMS_PATH)) {
    synonymMap = JSON.parse(fs.readFileSync(SYNONYMS_PATH, "utf-8"));
    console.log(`📖 Loaded ${Object.keys(synonymMap).length} synonym entries`);
  } else {
    console.warn("⚠️  No synonyms.json found — skipping synonym seeding");
  }

  // 5. Connect to database
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Truncate search tables (cascade clears foreign key dependents)
    console.log("🗑️  Truncating search tables...");
    await client.query("TRUNCATE diseases, symptoms, symptom_synonyms, disease_symptoms RESTART IDENTITY CASCADE");

    // 6. Insert diseases
    console.log("📥 Inserting diseases...");
    const diseaseIdMap = new Map<string, number>();
    for (const disease of uniqueDiseases) {
      const result = await client.query(
        `INSERT INTO diseases (name, description, urgency_level)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
          disease,
          `${disease} — a condition that may present with various symptoms. Consult a healthcare professional for accurate diagnosis and treatment.`,
          getUrgencyLevel(disease),
        ]
      );
      diseaseIdMap.set(disease, result.rows[0].id);
    }

    // 7. Insert symptoms
    console.log("📥 Inserting symptoms...");
    const symptomIdMap = new Map<string, number>();
    for (const symptom of uniqueSymptoms) {
      // Clean up the name: replace underscores with spaces for display
      const displayName = symptom.replace(/_/g, " ");
      const result = await client.query(
        `INSERT INTO symptoms (name, canonical)
         VALUES ($1, true)
         RETURNING id`,
        [displayName]
      );
      symptomIdMap.set(symptom, result.rows[0].id);
    }

    // 8. Insert symptom synonyms
    console.log("📥 Inserting symptom synonyms...");
    let synonymCount = 0;
    for (const [symptomKey, synonyms] of Object.entries(synonymMap)) {
      const symptomId = symptomIdMap.get(symptomKey);
      if (!symptomId) {
        // Try with spaces instead of underscores — symptom might be stored differently
        continue;
      }
      for (const syn of synonyms) {
        await client.query(
          `INSERT INTO symptom_synonyms (symptom_id, synonym_text)
           VALUES ($1, $2)`,
          [symptomId, syn.toLowerCase()]
        );
        synonymCount++;
      }
    }
    console.log(`   ↳ Inserted ${synonymCount} synonyms`);

    // 9. Insert disease-symptom weights
    console.log("📥 Inserting disease-symptom weights...");
    let weightCount = 0;
    for (const w of weights) {
      const diseaseId = diseaseIdMap.get(w.disease);
      const symptomId = symptomIdMap.get(w.symptom);
      if (!diseaseId || !symptomId) continue;

      await client.query(
        `INSERT INTO disease_symptoms (disease_id, symptom_id, weight, weight_source, computed_at)
         VALUES ($1, $2, $3, 'sf_idf', NOW())
         ON CONFLICT (disease_id, symptom_id) DO UPDATE SET weight = $3, computed_at = NOW()`,
        [diseaseId, symptomId, w.weight]
      );
      weightCount++;
    }
    console.log(`   ↳ Inserted ${weightCount} weights`);

    await client.query("COMMIT");

    // 10. Summary
    const diseaseCount = await client.query("SELECT COUNT(*) FROM diseases");
    const symptomCount = await client.query("SELECT COUNT(*) FROM symptoms");
    const dsCount = await client.query("SELECT COUNT(*) FROM disease_symptoms");
    const synCount = await client.query("SELECT COUNT(*) FROM symptom_synonyms");

    console.log(`
✅ Seed complete!
   Diseases:          ${diseaseCount.rows[0].count}
   Symptoms:          ${symptomCount.rows[0].count}
   Disease-symptoms:  ${dsCount.rows[0].count}
   Synonyms:          ${synCount.rows[0].count}
    `);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed — rolled back:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// ─── Run ─────────────────────────────────────────────────────────

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
