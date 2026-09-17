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
