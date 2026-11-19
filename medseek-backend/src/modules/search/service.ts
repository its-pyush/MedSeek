import { query } from "../../db/helpers.js";
import { notFound } from "../../utils/AppError.js";
import type { Cell } from "../cases/geo.js";
import { getLocalSignals, type LocalSignal } from "../cases/service.js";

// ─── Types ───────────────────────────────────────────────────────

export interface DiseaseResult {
  id: number;
  name: string;
  description: string | null;
  urgency_level: string;
  prevalence: string;
  score: number;
  /** 1 = best symptom match overall, before results are grouped by risk. */
  relevance_rank?: number;
  matched_symptoms: string[];
  total_symptoms: number;
  /** Present when confirmed cases near the user raised this condition's score. */
  local_signal?: LocalSignal;
}

export interface SearchResult {
  results: DiseaseResult[];
  dont_rule_out: DiseaseResult[];
  total: number;
  resolved_symptoms: ResolvedSymptom[];
}

export interface ResolvedSymptom {
  input: string;
  matched_name: string | null;
  matched_id: number | null;
  match_type: "exact" | "fuzzy" | "synonym" | "none";
}

export interface DiseaseDetail {
  id: number;
  icd11_code: string | null;
  name: string;
  description: string | null;
  urgency_level: string;
  prevalence: string;
  aliases: string[];
  source_url: string | null;
  created_at: string;
  symptoms: Array<{
    id: number;
    name: string;
    weight: number;
  }>;
}

export interface AutocompleteResult {
  id: number;
  name: string;
  match_source: "canonical" | "synonym";
  matched_text: string;
  similarity: number;
}

// ─── Symptom Resolution ─────────────────────────────────────────

const FUZZY_THRESHOLD = 0.3;

/**
 * Resolve a user-typed symptom string to a canonical symptom ID.
 *
 * Resolution order:
 *   1. Exact match on symptoms.name
 *   2. Exact match on symptom_synonyms.synonym_text
 *   3. Best fuzzy (pg_trgm) match across names AND synonyms together
 *
 * Exact synonyms are checked before any fuzzy match so that a lay phrase we
 * know ("head pain" → headache) is never hijacked by a look-alike name.
 */
export async function resolveSymptom(input: string): Promise<ResolvedSymptom> {
  // 1. Exact match on canonical name
  const exact = await query<{ id: number; name: string }>(
    `SELECT id, name FROM symptoms WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [input]
  );
  if (exact.rows.length > 0) {
    return {
      input,
      matched_name: exact.rows[0].name,
      matched_id: exact.rows[0].id,
      match_type: "exact",
    };
  }

  // 2. Exact match on a synonym
  const synExact = await query<{ symptom_id: number; name: string }>(
    `SELECT ss.symptom_id, s.name
     FROM symptom_synonyms ss
     JOIN symptoms s ON s.id = ss.symptom_id
     WHERE LOWER(ss.synonym_text) = LOWER($1)
     LIMIT 1`,
    [input]
  );
  if (synExact.rows.length > 0) {
    return {
      input,
      matched_name: synExact.rows[0].name,
      matched_id: synExact.rows[0].symptom_id,
      match_type: "synonym",
    };
  }

  // 3. Best fuzzy match across canonical names and synonyms
  const fuzzy = await query<{ id: number; name: string; source: "fuzzy" | "synonym"; sim: number }>(
    `SELECT id, name, source, sim FROM (
       SELECT s.id, s.name, 'fuzzy'::text AS source,
              similarity(LOWER(s.name), LOWER($1)) AS sim
       FROM symptoms s
       UNION ALL
       SELECT s.id, s.name, 'synonym'::text AS source,
              similarity(LOWER(ss.synonym_text), LOWER($1)) AS sim
       FROM symptom_synonyms ss
       JOIN symptoms s ON s.id = ss.symptom_id
     ) candidates
     WHERE sim > $2
     ORDER BY sim DESC, source ASC, name ASC
     LIMIT 1`,
    [input, FUZZY_THRESHOLD]
  );
  if (fuzzy.rows.length > 0) {
    return {
      input,
      matched_name: fuzzy.rows[0].name,
      matched_id: fuzzy.rows[0].id,
      match_type: fuzzy.rows[0].source,
    };
  }

  return { input, matched_name: null, matched_id: null, match_type: "none" };
}

// ─── Ranking ─────────────────────────────────────────────────────

/**
 * Prior applied to each disease's score: how often the condition is seen at all.
 * This is what stops a rare, frightening disease from outranking a common one
 * when the symptoms are vague. A season/location factor can multiply in here later.
 */
export const PREVALENCE_PRIOR: Record<string, number> = {
  very_common: 1.0,
  common: 0.7,
  uncommon: 0.4,
  rare: 0.2,
};

/** Maximum number of "don't rule out" warnings shown for one search. */
export const DONT_RULE_OUT_LIMIT = 3;

export interface RankedRow {
  id: number;
  name: string;
  description: string | null;
  urgency_level: string;
  prevalence: string;
  /** Symptom evidence only: Σ matched weights × share of the query explained. */
  evidence: number;
  /** evidence × prevalence prior × local boost — the main-list ranking score. */
  score: number;
  local_signal?: LocalSignal;
  match_count: number;
  has_key: boolean;
  matched_symptoms: string[];
  total_symptoms: number;
}

function toResult(row: RankedRow): DiseaseResult {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    urgency_level: row.urgency_level,
    prevalence: row.prevalence,
    score: row.score,
    matched_symptoms: row.matched_symptoms,
    total_symptoms: row.total_symptoms,
    ...(row.local_signal ? { local_signal: row.local_signal } : {}),
  };
}

/**
 * Pick the "don't rule out" warnings.
 *
 * Candidates are urgent conditions that did NOT make the main page. They are
 * ranked on symptom evidence alone (no prevalence prior), because the point of
 * this list is to surface the rare-but-dangerous option the prior pushed down.
 * To avoid alarming people over one vague symptom, a candidate must match at
 * least two of the entered symptoms — or, for a single-symptom search, that
 * symptom must be a distinctive ("key") sign of the condition.
 */
export function selectDontRuleOut(
  rows: RankedRow[],
  mainIds: Set<number>,
  querySymptomCount: number
): RankedRow[] {
  return rows
    .filter((r) => !mainIds.has(r.id))
    .filter((r) => r.urgency_level === "high" || r.urgency_level === "emergency")
    .filter((r) => (querySymptomCount <= 1 ? r.has_key : r.match_count >= 2))
    .sort((a, b) => b.evidence - a.evidence || a.name.localeCompare(b.name))
    .slice(0, DONT_RULE_OUT_LIMIT);
}

/** Display order of risk tiers: lowest first. */
export const RISK_ORDER: Record<string, number> = { low: 0, moderate: 1, high: 2, emergency: 3 };

/** Stable sort by risk tier; relevance order is preserved inside each tier. */
export function groupByRisk<T extends { urgency_level: string }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        (RISK_ORDER[a.row.urgency_level] ?? 1) - (RISK_ORDER[b.row.urgency_level] ?? 1) ||
        a.index - b.index
    )
    .map((x) => x.row);
}

// ─── Search ──────────────────────────────────────────────────────

export interface SearchFilters {
  sex?: "male" | "female" | "other";
  /** The user's area; when given, confirmed cases nearby can raise a condition. */
  cell?: Cell;
}

/**
 * Multi-symptom disease search.
 *
 *   score = Σ weight(disease, matched symptom)
 *           × (idf of matched symptoms ÷ idf of all entered symptoms)
 *           × prevalence prior
 *           × local boost (only when the user shares an area; see cases/service.ts)
 *
 * The middle factor penalises diseases that explain only part of what the
 * user entered; the prior favours common conditions.
 */
export async function searchDiseases(
  symptoms: string[],
  limit: number,
  offset: number,
  filters: SearchFilters = {}
): Promise<SearchResult> {
  const resolved = await Promise.all(symptoms.map(resolveSymptom));

  const matchedIds = [...new Set(
    resolved
      .filter((r) => r.matched_id !== null)
      .map((r) => r.matched_id as number)
  )];

  if (matchedIds.length === 0) {
    return { results: [], dont_rule_out: [], total: 0, resolved_symptoms: resolved };
  }

  // Sex-specific conditions are hidden only when the caller states the other sex.
  const sexFilter = filters.sex === "male" || filters.sex === "female" ? filters.sex : null;

  const ranked = await query<{
    id: number;
    name: string;
    description: string | null;
    urgency_level: string;
    prevalence: string;
    evidence: string;
    match_count: string;
    has_key: boolean;
    matched_symptoms: string[];
    total_symptoms: string;
  }>(
    `WITH q AS (
       SELECT id, idf FROM symptoms WHERE id = ANY($1)
     ),
     q_total AS (
       SELECT GREATEST(SUM(idf), 0.0001) AS total FROM q
     ),
     matched AS (
       SELECT
         ds.disease_id,
         SUM(ds.weight)  AS base,
         SUM(q.idf)      AS matched_idf,
         COUNT(*)        AS match_count,
         BOOL_OR(ds.is_key) AS has_key,
         ARRAY_AGG(s.name ORDER BY ds.weight DESC) AS matched_symptoms
       FROM disease_symptoms ds
       JOIN q ON q.id = ds.symptom_id
       JOIN symptoms s ON s.id = ds.symptom_id
       GROUP BY ds.disease_id
     )
     SELECT
       d.id, d.name, d.description, d.urgency_level, d.prevalence,
       (m.base * (m.matched_idf / q_total.total)) AS evidence,
       m.match_count, m.has_key, m.matched_symptoms,
       (SELECT COUNT(*) FROM disease_symptoms ds2 WHERE ds2.disease_id = d.id) AS total_symptoms
     FROM matched m
     JOIN diseases d ON d.id = m.disease_id
     CROSS JOIN q_total
     WHERE ($2::text IS NULL OR d.sex = 'any' OR d.sex = $2)`,
    [matchedIds, sexFilter]
  );

  const rows: RankedRow[] = ranked.rows
    .map((r): RankedRow => {
      const evidence = parseFloat(String(r.evidence));
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        urgency_level: r.urgency_level,
        prevalence: r.prevalence,
        evidence,
        score: evidence * (PREVALENCE_PRIOR[r.prevalence] ?? PREVALENCE_PRIOR.uncommon),
        match_count: parseInt(String(r.match_count), 10),
        has_key: r.has_key,
        matched_symptoms: r.matched_symptoms,
        total_symptoms: parseInt(String(r.total_symptoms), 10),
      };
    });

  // Local boost: confirmed cases near the user. Search still works without it
  // (no area given, table not migrated yet, or the query fails).
  if (filters.cell) {
    try {
      const signals = await getLocalSignals(rows.map((r) => r.name), filters.cell);
      for (const row of rows) {
        const signal = signals.get(row.name);
        if (signal) {
          row.score *= signal.boost;
          row.local_signal = signal;
        }
      }
    } catch (error) {
      console.error(
        "Local signal unavailable, ranking without it:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  rows
    .sort((a, b) => b.score - a.score || b.match_count - a.match_count || a.name.localeCompare(b.name));

  // Relevance decides WHICH conditions make the page; within the page they are
  // shown lowest risk first, so a reader meets the likely-harmless explanations
  // before the serious ones. Each result keeps its relevance rank for display.
  const page = groupByRisk(
    rows.slice(offset, offset + limit).map((r, i) => ({ ...r, relevance_rank: offset + i + 1 }))
  );
  // Everything up to the end of this page counts as "already shown"
  const shownIds = new Set(rows.slice(0, offset + limit).map((r) => r.id));
  const dontRuleOut = selectDontRuleOut(rows, shownIds, matchedIds.length);

  return {
    results: page.map((r) => ({ ...toResult(r), relevance_rank: r.relevance_rank })),
    dont_rule_out: dontRuleOut.map(toResult),
    total: rows.length,
    resolved_symptoms: resolved,
  };
}

// ─── Disease Detail ──────────────────────────────────────────────

/**
 * Get full disease record by ID, including all associated symptoms with weights.
 */
export async function getDiseaseById(id: number): Promise<DiseaseDetail> {
  const diseaseResult = await query<{
    id: number;
    icd11_code: string | null;
    name: string;
    description: string | null;
    urgency_level: string;
    prevalence: string;
    aliases: string[];
    source_url: string | null;
    created_at: string;
  }>(
    `SELECT id, icd11_code, name, description, urgency_level, prevalence, aliases, source_url, created_at
     FROM diseases WHERE id = $1`,
    [id]
  );

  if (diseaseResult.rows.length === 0) {
    throw notFound(`Disease with ID ${id} not found`);
  }

  const disease = diseaseResult.rows[0];

  // Fetch associated symptoms with weights, ordered by weight descending
  const symptomsResult = await query<{
    id: number;
    name: string;
    weight: number;
  }>(
    `SELECT s.id, s.name, ds.weight
     FROM disease_symptoms ds
     JOIN symptoms s ON s.id = ds.symptom_id
     WHERE ds.disease_id = $1
     ORDER BY ds.weight DESC`,
    [id]
  );

  return {
    ...disease,
    symptoms: symptomsResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      weight: parseFloat(String(r.weight)),
    })),
  };
}

// ─── Autocomplete ────────────────────────────────────────────────

/**
 * Symptom autocomplete — fuzzy-matches user input against canonical
 * symptom names and synonyms via pg_trgm similarity + prefix matching.
 *
 * Returns deduplicated results ranked by similarity score.
 */
export async function autocompleteSymptoms(
  queryStr: string,
  limit: number
): Promise<AutocompleteResult[]> {
  const normalizedQuery = queryStr.toLowerCase().trim();

  // Search both canonical names and synonyms, then UNION + deduplicate
  const result = await query<{
    id: number;
    name: string;
    match_source: "canonical" | "synonym";
    matched_text: string;
    sim: number;
  }>(
    `
    WITH matches AS (
      -- Canonical symptom name matches
      SELECT
        s.id,
        s.name,
        'canonical'::text AS match_source,
        s.name AS matched_text,
        GREATEST(
          similarity(LOWER(s.name), $1),
          CASE WHEN LOWER(s.name) LIKE ($1 || '%') THEN 0.8 ELSE 0.0 END
        ) AS sim
      FROM symptoms s
      WHERE similarity(LOWER(s.name), $1) > 0.2
         OR LOWER(s.name) LIKE ($1 || '%')

      UNION ALL

      -- Synonym matches (resolve to canonical)
      SELECT
        s.id,
        s.name,
        'synonym'::text AS match_source,
        ss.synonym_text AS matched_text,
        GREATEST(
          similarity(LOWER(ss.synonym_text), $1),
          CASE WHEN LOWER(ss.synonym_text) LIKE ($1 || '%') THEN 0.8 ELSE 0.0 END
        ) AS sim
      FROM symptom_synonyms ss
      JOIN symptoms s ON s.id = ss.symptom_id
      WHERE similarity(LOWER(ss.synonym_text), $1) > 0.2
         OR LOWER(ss.synonym_text) LIKE ($1 || '%')
    )
    SELECT DISTINCT ON (id) id, name, match_source, matched_text, sim
    FROM matches
    ORDER BY id, sim DESC
    `,
    [normalizedQuery]
  );

  // Sort by similarity and limit
  const sorted = result.rows
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit);

  return sorted.map((r) => ({
    id: r.id,
    name: r.name,
    match_source: r.match_source,
    matched_text: r.matched_text,
    similarity: parseFloat(String(r.sim)),
  }));
}

// ─── All symptoms ────────────────────────────────────────────────

export interface SymptomListItem {
  name: string;
  /** Other words people use for this symptom. */
  synonyms: string[];
  /** Number of conditions in the knowledge base that list this symptom. */
  disease_count: number;
  /** Body picker area/part ids, or the groups "general" / "skin" / "mind". */
  body_areas: string[];
}

/**
 * Every symptom in the knowledge base, most widely shared first.
 * The vocabulary is small (about 2,000 rows), so it is sent in one response
 * and filtered in the browser.
 */
export async function listSymptoms(): Promise<SymptomListItem[]> {
  const result = await query<SymptomListItem>(
    `
    SELECT
      s.name,
      COALESCE(syn.synonyms, '{}') AS synonyms,
      COALESCE(dc.n, 0)::int AS disease_count,
      s.body_areas
    FROM symptoms s
    LEFT JOIN (
      SELECT symptom_id, array_agg(synonym_text ORDER BY synonym_text) AS synonyms
      FROM symptom_synonyms GROUP BY symptom_id
    ) syn ON syn.symptom_id = s.id
    LEFT JOIN (
      SELECT symptom_id, COUNT(*) AS n FROM disease_symptoms GROUP BY symptom_id
    ) dc ON dc.symptom_id = s.id
    ORDER BY disease_count DESC, s.name ASC
    `
  );
  return result.rows;
}
