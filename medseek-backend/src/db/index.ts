import pg from "pg";

import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
});

/**
 * Verify database connectivity on startup.
 * Call this once during server bootstrap — if it throws, the server should not start.
 */
export async function verifyDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT NOW() AS current_time");
    console.log(
      `✅ Database connected — server time: ${result.rows[0].current_time}`
    );
  } finally {
    client.release();
  }
}

/**
 * Gracefully close the connection pool.
 */
export async function closeDatabasePool(): Promise<void> {
  await pool.end();
  console.log("🔌 Database pool closed");
}
