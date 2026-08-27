/**
 * Encryption service — server-managed AES-256-GCM encryption at rest.
 *
 * Uses envelope encryption pattern:
 * - A master key (ENCRYPTION_KEY from env) is used to derive per-record keys
 * - Each record gets a unique IV (initialization vector)
 * - The IV is prepended to the ciphertext for storage
 *
 * Format of encrypted_data in DB (bytea):
 *   [12-byte IV][16-byte auth tag][ciphertext]
 */

import crypto from "node:crypto";
import { env } from "../../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "ENCRYPTION_KEY is not configured — cannot encrypt/decrypt vault data. " +
      "Set a 64-character hex string (32 bytes) in .env"
    );
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars), got ${key.length} bytes`
    );
  }
  return key;
}

/**
 * Encrypt plaintext data to a Buffer suitable for storing in bytea.
 * Returns: [IV (12 bytes)][Auth Tag (16 bytes)][Ciphertext]
 */
export function encrypt(plaintext: string): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: IV + auth tag + ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt a Buffer back to plaintext.
 * Input format: [IV (12 bytes)][Auth Tag (16 bytes)][Ciphertext]
 */
export function decrypt(encryptedData: Buffer): string {
  const key = getEncryptionKey();

  if (encryptedData.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted data is too short — corrupted or invalid format");
  }

  const iv = encryptedData.subarray(0, IV_LENGTH);
  const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
