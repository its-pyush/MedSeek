/**
 * Seed script — loads the MedSeek knowledge base into the search tables.
 *
 * Input:  data/kb/medseek_kb.json  (built by `npm run kb:extract` + `npm run kb:build`)
 * Tables: diseases, symptoms, symptom_synonyms, disease_symptoms
 *         (symptoms.body_areas comes from data/kb/symptom_areas.json)
 *
 * The four tables are replaced in a single transaction. Before anything is
 * changed, their current contents are dumped to data/kb/backup-<timestamp>.json.
 * Patients, vault records, chat history and the audit log are never touched.
 *
 * Usage: npm run seed
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { env } from "../src/config/env.js";
import type { KnowledgeBase } from "./kb/build.js";
import { readAreas } from "./kb/areas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.join(__dirname, "..", "data", "kb");
const KB_PATH = path.join(KB_DIR, "medseek_kb.json");

const SEARCH_TABLES = ["diseases", "symptoms", "symptom_synonyms", "disease_symptoms"] as const;

async function seed() {
  if (!fs.existsSync(KB_PATH)) {
    throw new Error(`Knowledge base not found at ${KB_PATH}. Run: npm run kb:extract && npm run kb:build`);
  }
  const kb: KnowledgeBase = JSON.parse(fs.readFileSync(KB_PATH, "utf-8"));
  // Body areas per symptom (data/kb/symptom_areas.json); empty if the file is missing.
  const bodyAreas = readAreas();
  console.log(`\nMedSeek seed — ${kb.version}`);
  console.log(kb.stats);

  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    // 1. Backup current search tables
    const backup: Record<string, unknown[]> = {};
    for (const table of SEARCH_TABLES) {
      backup[table] = (await client.query(`SELECT * FROM ${table}`)).rows;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(KB_DIR, `backup-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup));
    console.log(`Backup of ${backup.diseases.length} diseases written to ${backupPath}`);

    await client.query("BEGIN");
    await client.query(
      "TRUNCATE diseases, symptoms, symptom_synonyms, disease_symptoms RESTART IDENTITY CASCADE"
    );

    // 2. Diseases
    const d = kb.diseases;
    const diseaseRows = await client.query<{ id: number; source_url: string }>(
      `INSERT INTO diseases (name, description, urgency_level, prevalence, sex, aliases, source_url)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::jsonb[], $7::text[])
       RETURNING id, source_url`,
      [
        d.map((x) => x.name),
        d.map((x) => x.summary),
        d.map((x) => x.urgency),
        d.map((x) => x.prevalence),
        d.map((x) => x.sex),
        d.map((x) => JSON.stringify(x.aliases)),
        d.map((x) => x.source_url),
      ]
    );
    const diseaseId = new Map(diseaseRows.rows.map((r) => [r.source_url, r.id]));

    // Model-written entries were not derived from a page, so they must not cite one.
    // (The URL is only used above as a unique key while inserting.)
    await client.query(`UPDATE diseases SET source_url = NULL WHERE source_url = ANY($1::text[])`, [
      d.filter((x) => x.basis === "model").map((x) => x.source_url),
    ]);

    // 3. Symptoms
    const s = kb.symptoms;
    const symptomRows = await client.query<{ id: number; name: string }>(
      `INSERT INTO symptoms (name, canonical, idf, body_areas)
       SELECT name, true, idf, ARRAY(SELECT jsonb_array_elements_text(areas::jsonb))
       FROM unnest($1::text[], $2::real[], $3::text[]) AS t(name, idf, areas)
       RETURNING id, name`,
      [s.map((x) => x.name), s.map((x) => x.idf), s.map((x) => JSON.stringify(bodyAreas[x.name] ?? []))]
    );
    const untagged = s.filter((x) => !bodyAreas[x.name]?.length).length;
    if (untagged) console.warn(`  ${untagged} symptoms have no body area — run: npm run kb:areas:build`);
    const symptomId = new Map(symptomRows.rows.map((r) => [r.name, r.id]));

    // 4. Synonyms
    const synSymptom: number[] = [];
    const synText: string[] = [];
    for (const sym of s) {
      for (const text of sym.synonyms) {
        synSymptom.push(symptomId.get(sym.name)!);
        synText.push(text);
      }
    }
    await client.query(
      `INSERT INTO symptom_synonyms (symptom_id, synonym_text)
       SELECT * FROM unnest($1::int[], $2::text[])`,
      [synSymptom, synText]
    );

    // 5. Disease ↔ symptom weights
    const lDisease: number[] = [];
    const lSymptom: number[] = [];
    const lWeight: number[] = [];
    const lKey: boolean[] = [];
    for (const dis of d) {
      for (const link of dis.symptoms) {
        lDisease.push(diseaseId.get(dis.source_url)!);
        lSymptom.push(symptomId.get(link.name)!);
        lWeight.push(link.weight);
        lKey.push(link.key);
      }
    }
    await client.query(
      `INSERT INTO disease_symptoms (disease_id, symptom_id, weight, is_key, weight_source, computed_at)
       SELECT d, s, w, k, 'kb_v1', NOW()
       FROM unnest($1::int[], $2::int[], $3::real[], $4::boolean[]) AS t(d, s, w, k)`,
      [lDisease, lSymptom, lWeight, lKey]
    );

    await client.query("COMMIT");

    const counts = await client.query(
      `SELECT (SELECT COUNT(*) FROM diseases) AS diseases,
              (SELECT COUNT(*) FROM symptoms) AS symptoms,
              (SELECT COUNT(*) FROM symptom_synonyms) AS synonyms,
              (SELECT COUNT(*) FROM disease_symptoms) AS links`
    );
    console.log("Seed complete:", counts.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Seed failed — rolled back, database unchanged.");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
