import jwt, { JwtPayload } from "jsonwebtoken";

import { env } from "../../config/env.js";

// ─── Types ───────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: number; // patient ID
  email: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: number; // patient ID
  type: "refresh";
}

// ─── Configuration ───────────────────────────────────────────────

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

function getJwtSecret(): string {
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured — cannot sign tokens");
  }
  return secret;
}

// ─── Token Signing ───────────────────────────────────────────────

/**
 * Sign a short-lived access token (15 minutes).
 */
export function signAccessToken(patientId: number, email: string): string {
  const payload: AccessTokenPayload = {
    sub: patientId,
    email,
    type: "access",
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

/**
 * Sign a long-lived refresh token (7 days).
 */
export function signRefreshToken(patientId: number): string {
  const payload: RefreshTokenPayload = {
    sub: patientId,
    type: "refresh",
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
}

/**
 * Issue both access and refresh tokens as a pair.
 */
export function issueTokenPair(
  patientId: number,
  email: string
): { accessToken: string; refreshToken: string } {
  return {
    accessToken: signAccessToken(patientId, email),
    refreshToken: signRefreshToken(patientId),
  };
}

// ─── Token Verification ─────────────────────────────────────────

/**
 * Verify and decode an access token.
 * Throws if expired, malformed, or wrong type.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const raw = jwt.verify(token, getJwtSecret());
  const decoded = raw as JwtPayload & Partial<AccessTokenPayload>;

  if (decoded.type !== "access" || typeof decoded.sub !== "number" || typeof decoded.email !== "string") {
    throw new Error("Invalid token type — expected access token");
  }

  return { sub: decoded.sub, email: decoded.email, type: "access" };
}

/**
 * Verify and decode a refresh token.
 * Throws if expired, malformed, or wrong type.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const raw = jwt.verify(token, getJwtSecret());
  const decoded = raw as JwtPayload & Partial<RefreshTokenPayload>;

  if (decoded.type !== "refresh" || typeof decoded.sub !== "number") {
    throw new Error("Invalid token type — expected refresh token");
  }

  return { sub: decoded.sub, type: "refresh" };
}
