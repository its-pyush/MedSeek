import { query } from "../../db/helpers.js";
import { notFound } from "../../utils/AppError.js";

// ─── Types ───────────────────────────────────────────────────────

export interface PatientProfile {
  patient_id: number;
  email: string;
  age: number | null;
  sex: string | null;
  pregnancy_status: boolean | null;
  existing_conditions: string[];
  created_at: string;
}

// ─── Get Profile ─────────────────────────────────────────────────

/**
 * Fetch a patient's full profile (account + extended profile data).
 */
export async function getPatientProfile(
  patientId: number
): Promise<PatientProfile> {
  const result = await query<PatientProfile>(
    `SELECT
       p.id AS patient_id,
       p.email,
       p.created_at,
       pp.age,
       pp.sex,
       pp.pregnancy_status,
       COALESCE(pp.existing_conditions, '[]'::jsonb) AS existing_conditions
     FROM patients p
     LEFT JOIN patient_profiles pp ON pp.patient_id = p.id
     WHERE p.id = $1`,
    [patientId]
  );

  if (result.rows.length === 0) {
    throw notFound("Patient not found");
  }

  return result.rows[0];
}

// ─── Update Profile ──────────────────────────────────────────────

/**
 * Update a patient's profile fields. Uses UPSERT to handle cases
 * where the profile row might not exist yet.
 *
 * Only provided (non-undefined) fields are updated.
 */
export async function updatePatientProfile(
  patientId: number,
  data: {
    age?: number | null;
    sex?: string | null;
    pregnancy_status?: boolean | null;
    existing_conditions?: string[] | null;
  }
): Promise<PatientProfile> {
  // Build SET clause dynamically from provided fields
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 2; // $1 is patient_id

  if (data.age !== undefined) {
    updates.push(`age = $${paramIndex++}`);
    values.push(data.age);
  }
  if (data.sex !== undefined) {
    updates.push(`sex = $${paramIndex++}`);
    values.push(data.sex);
  }
  if (data.pregnancy_status !== undefined) {
    updates.push(`pregnancy_status = $${paramIndex++}`);
    values.push(data.pregnancy_status);
  }
  if (data.existing_conditions !== undefined) {
    updates.push(`existing_conditions = $${paramIndex++}`);
    values.push(JSON.stringify(data.existing_conditions ?? []));
  }

  if (updates.length === 0) {
    // Nothing to update — just return current profile
    return getPatientProfile(patientId);
  }

  // UPSERT: insert profile if it doesn't exist, update if it does
  await query(
    `INSERT INTO patient_profiles (patient_id, ${updates.map((u) => u.split(" = ")[0]).join(", ")})
     VALUES ($1, ${values.map((_, i) => `$${i + 2}`).join(", ")})
     ON CONFLICT (patient_id)
     DO UPDATE SET ${updates.join(", ")}`,
    [patientId, ...values]
  );

  return getPatientProfile(patientId);
}
