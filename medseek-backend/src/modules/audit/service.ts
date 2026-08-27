/**
 * Audit service — records and queries access log entries.
 *
 * Every authenticated data access (success or failure) is logged
 * for patient transparency. Patients can see their own activity.
 */

import { query } from "../../db/helpers.js";

// ─── Types ───────────────────────────────────────────────────────

export interface AuditEntry {
  id: number;
  patient_id: number;
  action: string;
  target_table: string | null;
  target_id: number | null;
  success: boolean;
  timestamp: string;
}

// ─── Log Entry ───────────────────────────────────────────────────

/**
 * Write an audit log entry. Called by middleware or directly by services.
 */
export async function logAccess(
  patientId: number,
  action: string,
  targetTable?: string,
  targetId?: number,
  success = true
): Promise<void> {
  await query(
    `INSERT INTO access_log (patient_id, action, target_table, target_id, success)
     VALUES ($1, $2, $3, $4, $5)`,
    [patientId, action, targetTable ?? null, targetId ?? null, success]
  );
}

// ─── Query Logs ──────────────────────────────────────────────────

/**
 * Get a patient's own access log with pagination.
 * Optionally filtered by action type and date range.
 */
export async function getAccessLog(
  patientId: number,
  options: {
    action?: string;
    startDate?: string;
    endDate?: string;
    limit: number;
    offset: number;
  }
): Promise<{ entries: AuditEntry[]; total: number }> {
  const conditions = ["patient_id = $1"];
  const params: unknown[] = [patientId];
  let paramIdx = 2;

  if (options.action) {
    conditions.push(`action = $${paramIdx++}`);
    params.push(options.action);
  }

  if (options.startDate) {
    conditions.push(`timestamp >= $${paramIdx++}`);
    params.push(options.startDate);
  }

  if (options.endDate) {
    conditions.push(`timestamp <= $${paramIdx++}`);
    params.push(options.endDate);
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) FROM access_log WHERE ${where}`,
    params
  );

  const result = await query<AuditEntry>(
    `SELECT id, patient_id, action, target_table, target_id, success, timestamp
     FROM access_log WHERE ${where}
     ORDER BY timestamp DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, options.limit, options.offset]
  );

  return {
    entries: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

/**
 * Get distinct actions for filter UI.
 */
export async function getDistinctActions(
  patientId: number
): Promise<string[]> {
  const result = await query<{ action: string }>(
    `SELECT DISTINCT action FROM access_log
     WHERE patient_id = $1 ORDER BY action`,
    [patientId]
  );
  return result.rows.map((r) => r.action);
}
