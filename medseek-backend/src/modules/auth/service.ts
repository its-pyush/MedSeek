import bcrypt from "bcryptjs";

import { query } from "../../db/helpers.js";
import { AppError, badRequest } from "../../utils/AppError.js";
import { issueTokenPair, verifyRefreshToken } from "./jwt.js";

// ─── Types ───────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PatientRecord {
  id: number;
  email: string;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────

const BCRYPT_SALT_ROUNDS = 12;

// ─── Signup ──────────────────────────────────────────────────────

/**
 * Create a new patient account.
 * Returns JWT token pair on success.
 * Throws 409 if email already exists.
 */
export async function signup(
  email: string,
  password: string
): Promise<{ patient: PatientRecord; tokens: AuthTokens }> {
  // Check if email already exists
  const existing = await query<{ id: number }>(
    `SELECT id FROM patients WHERE email = $1`,
    [email]
  );

  if (existing.rows.length > 0) {
    throw new AppError("An account with this email already exists", 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  // Insert patient
  const result = await query<PatientRecord>(
    `INSERT INTO patients (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, created_at`,
    [email, passwordHash]
  );

  const patient = result.rows[0];

  // Create empty profile row
  await query(
    `INSERT INTO patient_profiles (patient_id) VALUES ($1)`,
    [patient.id]
  );

  // Issue tokens
  const tokens = issueTokenPair(patient.id, patient.email);

  return { patient, tokens };
}

// ─── Login ───────────────────────────────────────────────────────

/**
 * Authenticate a patient by email and password.
 * Returns JWT token pair on success.
 * Throws 401 on invalid credentials (intentionally vague message).
 */
export async function login(
  email: string,
  password: string
): Promise<{ patient: PatientRecord; tokens: AuthTokens }> {
  const result = await query<PatientRecord & { password_hash: string }>(
    `SELECT id, email, password_hash, created_at FROM patients WHERE email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    throw new AppError("Invalid email or password", 401);
  }

  const patient = result.rows[0];

  // Verify password
  const passwordValid = await bcrypt.compare(password, patient.password_hash);
  if (!passwordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  // Issue tokens
  const tokens = issueTokenPair(patient.id, patient.email);

  return {
    patient: { id: patient.id, email: patient.email, created_at: patient.created_at },
    tokens,
  };
}

// ─── Refresh Token ───────────────────────────────────────────────

/**
 * Validate a refresh token and issue a new access token.
 * The refresh token itself is NOT rotated (simple strategy for V1).
 */
export async function refresh(
  refreshToken: string
): Promise<AuthTokens> {
  try {
    const decoded = verifyRefreshToken(refreshToken);

    // Verify the patient still exists
    const result = await query<{ id: number; email: string }>(
      `SELECT id, email FROM patients WHERE id = $1`,
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      throw new AppError("Patient account no longer exists", 401);
    }

    const patient = result.rows[0];
    return issueTokenPair(patient.id, patient.email);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid or expired refresh token", 401);
  }
}

// ─── Get Current Patient ─────────────────────────────────────────

/**
 * Fetch the current patient's account info by ID.
 */
export async function getPatientById(
  patientId: number
): Promise<PatientRecord> {
  const result = await query<PatientRecord>(
    `SELECT id, email, created_at FROM patients WHERE id = $1`,
    [patientId]
  );

  if (result.rows.length === 0) {
    throw badRequest("Patient not found");
  }

  return result.rows[0];
}
