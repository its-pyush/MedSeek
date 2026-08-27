/**
 * Vault service — CRUD for encrypted personal health records.
 *
 * Data is encrypted before storage and decrypted on retrieval.
 * Only the owning patient can access their records.
 */

import { query } from "../../db/helpers.js";
import { notFound, badRequest } from "../../utils/AppError.js";
import { encrypt, decrypt } from "./encryption.js";

// ─── Types ───────────────────────────────────────────────────────

export type RecordType = "condition" | "medication" | "allergy" | "report";

export interface HealthRecord {
  id: number;
  patient_id: number;
  record_type: RecordType;
  data: Record<string, unknown>; // decrypted JSON
  created_at: string;
  updated_at: string;
}

export interface HealthRecordSummary {
  id: number;
  record_type: RecordType;
  created_at: string;
  updated_at: string;
}

// ─── List Records ────────────────────────────────────────────────

/**
 * List a patient's health records (metadata only — no decryption).
 * Optionally filtered by record type.
 */
export async function listRecords(
  patientId: number,
  recordType?: RecordType,
  limit = 50,
  offset = 0
): Promise<{ records: HealthRecordSummary[]; total: number }> {
  const conditions = ["patient_id = $1"];
  const params: unknown[] = [patientId];
  let paramIdx = 2;

  if (recordType) {
    conditions.push(`record_type = $${paramIdx++}`);
    params.push(recordType);
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) FROM health_records WHERE ${where}`,
    params
  );

  const result = await query<HealthRecordSummary>(
    `SELECT id, record_type, created_at, updated_at
     FROM health_records WHERE ${where}
     ORDER BY updated_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, limit, offset]
  );

  return {
    records: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

// ─── Get Record ──────────────────────────────────────────────────

/**
 * Get a specific health record with decrypted data.
 * Verifies ownership — patient can only access their own records.
 */
export async function getRecord(
  recordId: number,
  patientId: number
): Promise<HealthRecord> {
  const result = await query<{
    id: number;
    patient_id: number;
    record_type: RecordType;
    encrypted_data: Buffer;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, patient_id, record_type, encrypted_data, created_at, updated_at
     FROM health_records WHERE id = $1 AND patient_id = $2`,
    [recordId, patientId]
  );

  if (result.rows.length === 0) {
    throw notFound("Health record not found");
  }

  const row = result.rows[0];
  const decryptedJson = decrypt(row.encrypted_data);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(decryptedJson);
  } catch {
    throw badRequest("Failed to parse decrypted record data");
  }

  return {
    id: row.id,
    patient_id: row.patient_id,
    record_type: row.record_type,
    data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─── Create Record ───────────────────────────────────────────────

/**
 * Store a new encrypted health record.
 */
export async function createRecord(
  patientId: number,
  recordType: RecordType,
  data: Record<string, unknown>
): Promise<HealthRecord> {
  const plaintext = JSON.stringify(data);
  const encryptedData = encrypt(plaintext);

  const result = await query<{
    id: number;
    record_type: RecordType;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO health_records (patient_id, record_type, encrypted_data)
     VALUES ($1, $2, $3)
     RETURNING id, record_type, created_at, updated_at`,
    [patientId, recordType, encryptedData]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    patient_id: patientId,
    record_type: row.record_type,
    data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─── Update Record ───────────────────────────────────────────────

/**
 * Update an existing health record. Re-encrypts the data.
 */
export async function updateRecord(
  recordId: number,
  patientId: number,
  data: Record<string, unknown>
): Promise<HealthRecord> {
  // Verify ownership first
  const check = await query<{ id: number }>(
    `SELECT id FROM health_records WHERE id = $1 AND patient_id = $2`,
    [recordId, patientId]
  );

  if (check.rows.length === 0) {
    throw notFound("Health record not found");
  }

  const plaintext = JSON.stringify(data);
  const encryptedData = encrypt(plaintext);

  const result = await query<{
    id: number;
    record_type: RecordType;
    created_at: string;
    updated_at: string;
  }>(
    `UPDATE health_records
     SET encrypted_data = $1, updated_at = NOW()
     WHERE id = $2 AND patient_id = $3
     RETURNING id, record_type, created_at, updated_at`,
    [encryptedData, recordId, patientId]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    patient_id: patientId,
    record_type: row.record_type,
    data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─── Delete Record ───────────────────────────────────────────────

/**
 * Delete a health record. Only the owning patient can delete.
 */
export async function deleteRecord(
  recordId: number,
  patientId: number
): Promise<void> {
  const result = await query(
    `DELETE FROM health_records WHERE id = $1 AND patient_id = $2`,
    [recordId, patientId]
  );

  if (result.rowCount === 0) {
    throw notFound("Health record not found");
  }
}
