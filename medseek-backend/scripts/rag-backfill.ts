/**
 * One-off idempotent backfill script for MedSeek RAG vector index.
 *
 * Reads all existing patient profiles and encrypted vault records,
 * formats them for embedding, generates 1024-dimension vectors via NVIDIA NIM,
 * and upserts them into `rag_chunks` in pgvector.
 *
 * Usage:
 *   npm run rag:backfill
 */

import { pool } from "../src/db/index.js";
import { env } from "../src/config/env.js";
import { embed } from "../src/services/ai/nim.js";
import { decrypt } from "../src/modules/vault/encryption.js";
import {
  formatVaultRecordForEmbedding,
  formatPatientProfileForEmbedding,
  CompactPatientProfile,
} from "../src/modules/ai/rag.service.js";

const BATCH_SIZE = 10;
const INTER_BATCH_PAUSE_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runBackfill(): Promise<void> {
  console.log("🚀 Starting MedSeek RAG Vector Backfill...\n");

  if (!env.NVIDIA_API_KEY) {
    console.error("❌ NVIDIA_API_KEY is not configured in environment. Aborting backfill.");
    process.exit(1);
  }

  // 1. Backfill Patient Profiles
  console.log("📋 Fetching patient profiles...");
  const profilesResult = await pool.query<{
    patient_id: number;
    age: number | null;
    sex: string | null;
    pregnancy_status: boolean | null;
    existing_conditions: string[] | null;
  }>(
    `SELECT p.id AS patient_id, pp.age, pp.sex, pp.pregnancy_status,
            COALESCE(pp.existing_conditions, '[]'::jsonb) AS existing_conditions
     FROM patients p
     LEFT JOIN patient_profiles pp ON pp.patient_id = p.id
     ORDER BY p.id ASC`
  );

  const profileItems: { patientId: number; text: string }[] = [];

  for (const row of profilesResult.rows) {
    const compact: CompactPatientProfile = {
      age: row.age,
      sex: row.sex,
      pregnancy_status: row.pregnancy_status,
      existing_conditions: row.existing_conditions,
    };

    const text = formatPatientProfileForEmbedding(compact);
    if (text) {
      profileItems.push({ patientId: row.patient_id, text });
    }
  }

  console.log(`Found ${profileItems.length} patient profiles to index.`);

  let profilesIndexed = 0;
  for (let i = 0; i < profileItems.length; i += BATCH_SIZE) {
    const batch = profileItems.slice(i, i + BATCH_SIZE);
    const texts = batch.map((b) => b.text);

    try {
      const embeddings = await embed(texts, "passage");

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const vecStr = `[${embeddings[j].join(",")}]`;

        // Idempotent: delete previous profile chunk before insert
        await pool.query(
          `DELETE FROM rag_chunks WHERE patient_id = $1 AND source_type = 'profile'`,
          [item.patientId]
        );

        await pool.query(
          `INSERT INTO rag_chunks (patient_id, source_type, source_id, embedding)
           VALUES ($1, 'profile', $1, CAST($2 AS halfvec))`,
          [item.patientId, vecStr]
        );

        profilesIndexed++;
      }

      console.log(`  Indexed profiles: ${profilesIndexed}/${profileItems.length}`);
    } catch (err) {
      console.error(
        `  ⚠️ Failed batch ${i / BATCH_SIZE + 1} for profiles:`,
        err instanceof Error ? err.message : err
      );
    }

    if (i + BATCH_SIZE < profileItems.length) {
      await sleep(INTER_BATCH_PAUSE_MS);
    }
  }

  // 2. Backfill Health Records from Vault
  console.log("\n🔒 Fetching encrypted vault records...");
  const recordsResult = await pool.query<{
    id: number;
    patient_id: number;
    record_type: string;
    encrypted_data: Buffer;
  }>(
    `SELECT id, patient_id, record_type, encrypted_data
     FROM health_records
     ORDER BY id ASC`
  );

  const recordItems: {
    recordId: number;
    patientId: number;
    recordType: string;
    text: string;
  }[] = [];

  for (const row of recordsResult.rows) {
    try {
      const decrypted = decrypt(row.encrypted_data);
      const data = JSON.parse(decrypted);
      const text = formatVaultRecordForEmbedding(row.record_type, data);
      recordItems.push({
        recordId: row.id,
        patientId: row.patient_id,
        recordType: row.record_type,
        text,
      });
    } catch {
      console.warn(`  ⚠️ Could not decrypt record ID ${row.id} (skipped)`);
    }
  }

  console.log(`Found ${recordItems.length} decryptable vault records to index.`);

  let recordsIndexed = 0;
  for (let i = 0; i < recordItems.length; i += BATCH_SIZE) {
    const batch = recordItems.slice(i, i + BATCH_SIZE);
    const texts = batch.map((b) => b.text);

    try {
      const embeddings = await embed(texts, "passage");

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const vecStr = `[${embeddings[j].join(",")}]`;

        // Idempotent: delete previous chunk for this record before insert
        await pool.query(
          `DELETE FROM rag_chunks
           WHERE patient_id = $1 AND source_id = $2 AND source_type != 'profile'`,
          [item.patientId, item.recordId]
        );

        await pool.query(
          `INSERT INTO rag_chunks (patient_id, source_type, source_id, embedding)
           VALUES ($1, $2, $3, CAST($4 AS halfvec))`,
          [item.patientId, item.recordType, item.recordId, vecStr]
        );

        recordsIndexed++;
      }

      console.log(`  Indexed vault records: ${recordsIndexed}/${recordItems.length}`);
    } catch (err) {
      console.error(
        `  ⚠️ Failed batch ${i / BATCH_SIZE + 1} for vault records:`,
        err instanceof Error ? err.message : err
      );
    }

    if (i + BATCH_SIZE < recordItems.length) {
      await sleep(INTER_BATCH_PAUSE_MS);
    }
  }

  console.log("\n✅ RAG Backfill Complete!");
  console.log(`   - Patient profiles indexed: ${profilesIndexed}`);
  console.log(`   - Vault records indexed:    ${recordsIndexed}\n`);
}

runBackfill()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
