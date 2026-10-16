/**
 * RAG Service — Vector indexing and retrieval grounded in patient health data.
 *
 * Security guarantees:
 * - Plaintext PHI is NEVER stored in the vector database (`rag_chunks`).
 * - Only 1024-dimension embeddings and source references are stored.
 * - Records are decrypted just-in-time via the Vault service.
 * - Every retrieval query strictly enforces `patient_id` from authentication.
 */

import { env } from "../../config/env.js";
import { query } from "../../db/helpers.js";
import { embed } from "../../services/ai/nim.js";
import { getRecord } from "../vault/service.js";
import { getPatientProfile } from "../auth/profile.service.js";

// ─── Types ───────────────────────────────────────────────────────

export interface RetrievedChunk {
  text: string;
  source_type: string;
  source_id: number;
  score: number;
}

export interface CompactPatientProfile {
  age?: number | null;
  sex?: string | null;
  pregnancy_status?: boolean | null;
  existing_conditions?: string[] | null;
}

// ─── Text Formatting Helpers ─────────────────────────────────────

/**
 * Format vault record data into a compact, semantically dense text
 * string suitable for generating embeddings.
 */
export function formatVaultRecordForEmbedding(
  recordType: string,
  data: Record<string, unknown>
): string {
  const entries = Object.entries(data)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);

  return `[${recordType.toUpperCase()}] ${entries.join(", ")}`;
}

/**
 * Format patient profile demographic and clinical background into a compact
 * text string suitable for vector embedding.
 */
export function formatPatientProfileForEmbedding(
  profile: CompactPatientProfile
): string | null {
  const parts: string[] = [];

  if (profile.age !== null && profile.age !== undefined) {
    parts.push(`Age: ${profile.age}`);
  }
  if (profile.sex) {
    parts.push(`Sex: ${profile.sex}`);
  }
  if (profile.pregnancy_status) {
    parts.push(`Currently pregnant: Yes`);
  }
  if (
    profile.existing_conditions &&
    Array.isArray(profile.existing_conditions) &&
    profile.existing_conditions.length > 0
  ) {
    parts.push(`Existing conditions: ${profile.existing_conditions.join(", ")}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `[PATIENT PROFILE] ${parts.join("; ")}`;
}

// ─── Indexing Hooks ──────────────────────────────────────────────

/**
 * Index a newly created or updated health record in `rag_chunks`.
 * Removes any pre-existing chunk for this source_id first to remain idempotent.
 */
export async function syncVaultRecord(
  patientId: number,
  recordId: number,
  recordType: string,
  data: Record<string, unknown>
): Promise<void> {
  // 1. Delete old chunk by source_id for this patient
  await deleteVaultRecordChunk(patientId, recordId);

  // If AI key is not configured, skip embedding generation gracefully
  if (!env.NVIDIA_API_KEY) {
    return;
  }

  // 2. Format compact text and generate embedding (input_type: "passage")
  const text = formatVaultRecordForEmbedding(recordType, data);
  const embeddings = await embed([text], "passage");

  if (!embeddings || embeddings.length === 0 || !embeddings[0]) {
    return;
  }

  const vecStr = `[${embeddings[0].join(",")}]`;

  // 3. Insert chunk (NO PLAINTEXT PHI STORED)
  await query(
    `INSERT INTO rag_chunks (patient_id, source_type, source_id, embedding)
     VALUES ($1, $2, $3, CAST($4 AS halfvec))`,
    [patientId, recordType, recordId, vecStr]
  );
}

/**
 * Delete a health record's chunk from `rag_chunks`.
 */
export async function deleteVaultRecordChunk(
  patientId: number,
  recordId: number
): Promise<void> {
  await query(
    `DELETE FROM rag_chunks
     WHERE patient_id = $1 AND source_id = $2 AND source_type != 'profile'`,
    [patientId, recordId]
  );
}

/**
 * Index a patient's demographic profile in `rag_chunks`.
 */
export async function syncPatientProfile(
  patientId: number,
  profile: CompactPatientProfile
): Promise<void> {
  // 1. Delete previous profile chunk for this patient
  await query(
    `DELETE FROM rag_chunks WHERE patient_id = $1 AND source_type = 'profile'`,
    [patientId]
  );

  if (!env.NVIDIA_API_KEY) {
    return;
  }

  const text = formatPatientProfileForEmbedding(profile);
  if (!text) {
    return;
  }

  const embeddings = await embed([text], "passage");
  if (!embeddings || embeddings.length === 0 || !embeddings[0]) {
    return;
  }

  const vecStr = `[${embeddings[0].join(",")}]`;

  await query(
    `INSERT INTO rag_chunks (patient_id, source_type, source_id, embedding)
     VALUES ($1, 'profile', $1, CAST($2 AS halfvec))`,
    [patientId, vecStr]
  );
}

// ─── Retrieval ───────────────────────────────────────────────────

/**
 * Retrieve top-k relevant health records for a patient's question.
 *
 * Process:
 * 1. Embed query with input_type = "query".
 * 2. Perform cosine similarity search via pgvector strictly filtered by patient_id.
 * 3. Enforce minimum similarity threshold (default 0.5).
 * 4. Fetch and decrypt matching records via vault service (never duplicating decryption).
 * 5. Return structured chunks with decrypted text, source type, source id, and score.
 */
export async function retrieve(
  patientId: number,
  question: string,
  k = 5,
  minSimilarity = 0.25
): Promise<RetrievedChunk[]> {
  if (!question || !question.trim()) {
    return [];
  }

  // 1. Embed question as "query"
  const embeddings = await embed([question.trim()], "query");
  if (!embeddings || embeddings.length === 0 || !embeddings[0]) {
    return [];
  }

  const queryVecStr = `[${embeddings[0].join(",")}]`;

  // 2. Cosine distance search with strict patient isolation
  // Note: 1 - cosine_distance = cosine_similarity
  const result = await query<{
    source_type: string;
    source_id: number;
    score: number;
  }>(
    `SELECT source_type, source_id, (1 - (embedding <=> CAST($1 AS halfvec))) AS score
     FROM rag_chunks
     WHERE patient_id = $2
     ORDER BY embedding <=> CAST($1 AS halfvec) ASC
     LIMIT $3`,
    [queryVecStr, patientId, k]
  );

  // 3. Filter by similarity threshold
  const matchingRows = result.rows.filter((r) => Number(r.score) >= minSimilarity);

  // 4. Fetch and decrypt records via existing services
  const chunks: RetrievedChunk[] = [];

  for (const row of matchingRows) {
    const score = Number(row.score);

    if (row.source_type === "profile") {
      try {
        const profile = await getPatientProfile(patientId);
        const text = formatPatientProfileForEmbedding(profile);
        if (text) {
          chunks.push({
            text,
            source_type: "profile",
            source_id: patientId,
            score,
          });
        }
      } catch {
        // Skip if profile cannot be retrieved
      }
    } else {
      try {
        // Vault getRecord verifies patientId and decrypts using AES-256-GCM
        const record = await getRecord(row.source_id, patientId);
        const text = formatVaultRecordForEmbedding(record.record_type, record.data);
        chunks.push({
          text,
          source_type: record.record_type,
          source_id: record.id,
          score,
        });
      } catch {
        // Skip if record was deleted or cannot be decrypted
      }
    }
  }

  return chunks;
}
