import crypto from "node:crypto";

import { query } from "../../db/helpers.js";
import { env } from "../../config/env.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import type { Cell } from "./geo.js";

/**
 * Local signal: what users near you were recently diagnosed with.
 *
 * "Near" is the user's grid cell plus its eight neighbours. For each
 * condition we compare the last 28 days with what is usual for that area
 * (the average 28-day count over the 24 weeks before), and turn the ratio
 * into a multiplier on the search score:
 *
 *   boost = (recent + 5) / (usual + 5), kept between 1 and 3
 *
 * The +5 means a handful of reports barely moves anything. The boost only
 * ever raises a condition, and it is applied (and shown) only from 5 recent
 * cases up. The window, the +5 and the cap are judgment calls, not values
 * fitted to data. Reports are self-declared and unverified.
 */

export const WINDOW_DAYS = 28;
/** Number of earlier 28-day windows that make up "usual". */
export const BASELINE_WINDOWS = 6;
export const SMOOTHING = 5;
export const MAX_BOOST = 3;
/** Below this many recent cases nothing is boosted or shown. */
export const MIN_CASES = 5;

export interface LocalSignal {
  /** Confirmed cases near the user in the last WINDOW_DAYS days. */
  cases: number;
  /** Multiplier applied to the search score (1 = no effect). */
  boost: number;
  window_days: number;
  /** True when any of the counted cases are sample data, not real reports. */
  simulated: boolean;
}

export function localBoost(recent: number, usual: number): number {
  if (recent < MIN_CASES) return 1;
  const ratio = (recent + SMOOTHING) / (Math.max(0, usual) + SMOOTHING);
  return Math.min(MAX_BOOST, Math.max(1, ratio));
}

interface CountRow {
  disease_name: string;
  recent: number;
  earlier: number;
  recent_sample: number;
}

function includeSample(): boolean {
  return env.LOCAL_SIGNAL_INCLUDE_SAMPLE === "true";
}

function toSignal(row: CountRow): LocalSignal {
  return {
    cases: row.recent,
    boost: localBoost(row.recent, row.earlier / BASELINE_WINDOWS),
    window_days: WINDOW_DAYS,
    simulated: row.recent_sample > 0,
  };
}

const COUNTS_SQL = `
  SELECT disease_name,
         COUNT(*) FILTER (WHERE reported_on >  CURRENT_DATE - $3::int)::int AS recent,
         COUNT(*) FILTER (WHERE reported_on <= CURRENT_DATE - $3::int)::int AS earlier,
         COUNT(*) FILTER (WHERE reported_on >  CURRENT_DATE - $3::int AND source = 'sample')::int AS recent_sample
  FROM case_reports
  WHERE cell_lat BETWEEN $1::int - 1 AND $1::int + 1
    AND cell_lon BETWEEN $2::int - 1 AND $2::int + 1
    AND reported_on > CURRENT_DATE - $4::int
    AND ($5::boolean OR source = 'user')`;

function countParams(cell: Cell): unknown[] {
  return [cell.lat, cell.lon, WINDOW_DAYS, WINDOW_DAYS * (BASELINE_WINDOWS + 1), includeSample()];
}

/** Signals for the given conditions near a cell. Conditions with no effect are left out. */
export async function getLocalSignals(
  diseaseNames: string[],
  cell: Cell
): Promise<Map<string, LocalSignal>> {
  const signals = new Map<string, LocalSignal>();
  if (diseaseNames.length === 0) return signals;
  const result = await query<CountRow>(
    `${COUNTS_SQL} AND disease_name = ANY($6::text[]) GROUP BY disease_name`,
    [...countParams(cell), diseaseNames]
  );
  for (const row of result.rows) {
    const signal = toSignal(row);
    if (signal.boost > 1) signals.set(row.disease_name, signal);
  }
  return signals;
}

/** The conditions most above their usual level near a cell (for the chat's context). */
export async function getTopLocalSignals(
  cell: Cell,
  limit = 3
): Promise<Array<LocalSignal & { disease_name: string }>> {
  const result = await query<CountRow>(`${COUNTS_SQL} GROUP BY disease_name`, countParams(cell));
  return result.rows
    .map((row) => ({ disease_name: row.disease_name, ...toSignal(row) }))
    .filter((s) => s.boost >= 1.5)
    .sort((a, b) => b.boost - a.boost || b.cases - a.cases)
    .slice(0, limit);
}

/** One person counts once per condition per month; the hash keeps the row free of patient ids. */
export function reporterHash(patientId: number, diseaseName: string): string {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET is required to record a case");
  return crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(`case:${patientId}:${diseaseName.toLowerCase()}`)
    .digest("hex");
}

/** Records "a doctor diagnosed me with this". Returns false if already counted this month. */
export async function recordCase(
  patientId: number,
  diseaseId: number,
  cell: Cell
): Promise<{ counted: boolean; disease_name: string }> {
  const disease = await query<{ name: string }>(`SELECT name FROM diseases WHERE id = $1`, [diseaseId]);
  if (disease.rows.length === 0) throw notFound("Condition not found");
  const name = disease.rows[0].name;
  if (!Number.isInteger(cell.lat) || !Number.isInteger(cell.lon)) throw badRequest("Invalid area");

  const inserted = await query(
    `INSERT INTO case_reports (disease_name, cell_lat, cell_lon, source, reporter_hash)
     VALUES ($1, $2, $3, 'user', $4)
     ON CONFLICT (reporter_hash, disease_name, report_month) DO NOTHING`,
    [name, cell.lat, cell.lon, reporterHash(patientId, name)]
  );
  return { counted: (inserted.rowCount ?? 0) > 0, disease_name: name };
}
