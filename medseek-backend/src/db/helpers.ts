import { QueryResult, QueryResultRow } from "pg";

import { pool } from "./index.js";

/**
 * Execute a parameterized query against the connection pool.
 * Thin typed wrapper — avoids repeating `pool.query` everywhere.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(sql, params);
}

/**
 * Run a callback inside a database transaction.
 *
 * Acquires a client from the pool, begins a transaction, executes the
 * callback, and commits. On any error, rolls back and re-throws.
 * The client is always released back to the pool.
 *
 * Usage:
 *   const result = await transaction(async (client) => {
 *     await client.query("INSERT INTO ...");
 *     return client.query("SELECT ...");
 *   });
 */
export async function transaction<T>(
  callback: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
