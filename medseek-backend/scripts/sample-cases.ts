/**
 * Sample case data for demonstrating the local signal.
 *
 *   npm run cases:sample -- --cell 19.0,72.5              dengue rise in that area
 *   npm run cases:sample -- --cell 19.0,72.5 --disease "Malaria" --count 40
 *   npm run cases:sample -- --clear                        remove all sample rows
 *
 * Every row is marked source = 'sample'. Sample rows are ignored by the
 * search unless the backend runs with LOCAL_SIGNAL_INCLUDE_SAMPLE=true, and
 * results that used them are flagged `simulated`. These are invented numbers,
 * not real reports.
 */

import pg from "pg";

import { env } from "../src/config/env.js";
import { parseCell } from "../src/modules/cases/geo.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  try {
    if (process.argv.includes("--clear")) {
      const removed = await pool.query(`DELETE FROM case_reports WHERE source = 'sample'`);
      console.log(`Removed ${removed.rowCount} sample rows.`);
      return;
    }

    const cell = parseCell(arg("cell") ?? "");
    if (!cell) throw new Error('Give an area corner in half-degree steps, e.g. --cell 19.0,72.5');
    const diseaseName = arg("disease") ?? "Dengue fever";
    const count = Number(arg("count") ?? 42);

    const disease = await pool.query<{ name: string }>(
      `SELECT name FROM diseases WHERE LOWER(name) = LOWER($1)`,
      [diseaseName]
    );
    if (disease.rows.length === 0) throw new Error(`No condition named "${diseaseName}" in the knowledge base`);
    const name = disease.rows[0].name;

    // A rise: a few cases a month for the past half year, then `count` in the last four weeks.
    const daysAgo: number[] = [];
    for (let i = 0; i < count; i++) daysAgo.push(Math.floor((i * 27) / Math.max(1, count - 1)));
    for (let window = 1; window <= 6; window++) for (let i = 0; i < 2; i++) daysAgo.push(28 * window + 7 + i * 10);

    const stamp = Date.now();
    const result = await pool.query(
      `INSERT INTO case_reports (disease_name, cell_lat, cell_lon, reported_on, report_month, source, reporter_hash)
       SELECT $1, $2, $3, CURRENT_DATE - d, date_trunc('month', CURRENT_DATE - d)::date, 'sample', 'sample-' || $4 || '-' || n
       FROM unnest($5::int[]) WITH ORDINALITY AS t(d, n)`,
      [name, cell.lat, cell.lon, String(stamp), daysAgo]
    );
    console.log(
      `Inserted ${result.rowCount} SAMPLE rows for "${name}" near ${arg("cell")}: ${count} in the last 28 days, 12 over the 24 weeks before.`
    );
    console.log("They count only when the backend runs with LOCAL_SIGNAL_INCLUDE_SAMPLE=true.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
