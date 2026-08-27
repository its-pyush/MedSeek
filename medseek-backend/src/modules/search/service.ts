import { query } from "../../db/helpers.js";
import { notFound } from "../../utils/AppError.js";

// ─── Types ───────────────────────────────────────────────────────

export interface DiseaseResult {
  id: number;
  name: string;
  description: string | null;
  urgency_level: string;
  score: number;
  matched_symptoms: string[];
  total_symptoms: number;
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

/**
 * Resolve a user-typed symptom string to a canonical symptom ID.
 *
 * Resolution order:
 *   1. Exact match on symptoms.name
 *   2. Fuzzy match via pg_trgm similarity on symptoms.name
 *   3. Synonym lookup (exact then fuzzy) on symptom_synonyms.synonym_text
 */
async function resolveSymptom(input: string): Promise<ResolvedSymptom> {
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

  // 2. Fuzzy match on canonical name via pg_trgm
  const fuzzy = await query<{ id: number; name: string; sim: number }>(
    `SELECT id, name, similarity(LOWER(name), LOWER($1)) AS sim
     FROM symptoms
     WHERE similarity(LOWER(name), LOWER($1)) > 0.3
     ORDER BY sim DESC
     LIMIT 1`,
    [input]
  );
  if (fuzzy.rows.length > 0) {
    return {
      input,
      matched_name: fuzzy.rows[0].name,
      matched_id: fuzzy.rows[0].id,
      match_type: "fuzzy",
    };
  }

  // 3. Synonym lookup — exact
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

  // 4. Synonym lookup — fuzzy
  const synFuzzy = await query<{ symptom_id: number; name: string; sim: number }>(
    `SELECT ss.symptom_id, s.name, similarity(LOWER(ss.synonym_text), LOWER($1)) AS sim
     FROM symptom_synonyms ss
     JOIN symptoms s ON s.id = ss.symptom_id
     WHERE similarity(LOWER(ss.synonym_text), LOWER($1)) > 0.3
     ORDER BY sim DESC
     LIMIT 1`,
    [input]
  );
  if (synFuzzy.rows.length > 0) {
    return {
      input,
      matched_name: synFuzzy.rows[0].name,
      matched_id: synFuzzy.rows[0].symptom_id,
      match_type: "synonym",
    };
  }

  // No match found
  return { input, matched_name: null, matched_id: null, match_type: "none" };
}

// ─── Search ──────────────────────────────────────────────────────

/**
 * Multi-symptom disease search with sf-idf weighted ranking.
 *
 * Resolves each input symptom to a canonical ID, then queries
 * disease_symptoms to aggregate weighted scores per disease.
 * Returns results ranked by total weight, with a separate
 * "don't rule out" section for high-urgency matches.
 */
export async function searchDiseases(
  symptoms: string[],
  limit: number,
  offset: number
): Promise<SearchResult> {
  // Resolve all symptoms
  const resolved = await Promise.all(symptoms.map(resolveSymptom));

  // Collect successfully matched symptom IDs (deduplicated)
  const matchedIds = [...new Set(
    resolved
      .filter((r) => r.matched_id !== null)
      .map((r) => r.matched_id as number)
  )];

  if (matchedIds.length === 0) {
    return {
      results: [],
      dont_rule_out: [],
      total: 0,
      resolved_symptoms: resolved,
    };
  }

  // Build the ranked disease query
  // Uses SUM(weight) across matched symptoms, secondary sort by match count
  const rankingQuery = `
    WITH matched AS (
      SELECT
        ds.disease_id,
        SUM(ds.weight) AS total_score,
        COUNT(ds.symptom_id) AS match_count,
        ARRAY_AGG(s.name ORDER BY ds.weight DESC) AS matched_symptoms
      FROM disease_symptoms ds
      JOIN symptoms s ON s.id = ds.symptom_id
      WHERE ds.symptom_id = ANY($1)
      GROUP BY ds.disease_id
    )
    SELECT
      d.id,
      d.name,
      d.description,
      d.urgency_level,
      m.total_score AS score,
      m.match_count,
      m.matched_symptoms,
      (SELECT COUNT(*) FROM disease_symptoms ds2 WHERE ds2.disease_id = d.id) AS total_symptoms
    FROM matched m
    JOIN diseases d ON d.id = m.disease_id
    ORDER BY m.total_score DESC, m.match_count DESC, d.name ASC
  `;

  const allResults = await query<{
    id: number;
    name: string;
    description: string | null;
    urgency_level: string;
    score: number;
    match_count: number;
    matched_symptoms: string[];
    total_symptoms: string;
  }>(rankingQuery, [matchedIds]);

  const total = allResults.rows.length;

  // Split into main results and "don't rule out" section
  const mainResults: DiseaseResult[] = [];
  const dontRuleOut: DiseaseResult[] = [];

  // Determine a minimum threshold for "don't rule out" — any score above 0
  const mainResultIds = new Set<number>();

  // Paginate the main results
  const paginatedRows = allResults.rows.slice(offset, offset + limit);
  for (const row of paginatedRows) {
    mainResults.push({
      id: row.id,
      name: row.name,
      description: row.description,
      urgency_level: row.urgency_level,
      score: parseFloat(String(row.score)),
      matched_symptoms: row.matched_symptoms,
      total_symptoms: parseInt(String(row.total_symptoms), 10),
    });
    mainResultIds.add(row.id);
  }

  // "Don't rule out" — high/emergency urgency diseases that scored but aren't in the paginated results
  for (const row of allResults.rows) {
    if (
      !mainResultIds.has(row.id) &&
      (row.urgency_level === "high" || row.urgency_level === "emergency")
    ) {
      dontRuleOut.push({
        id: row.id,
        name: row.name,
        description: row.description,
        urgency_level: row.urgency_level,
        score: parseFloat(String(row.score)),
        matched_symptoms: row.matched_symptoms,
        total_symptoms: parseInt(String(row.total_symptoms), 10),
      });
    }
  }

  return {
    results: mainResults,
    dont_rule_out: dontRuleOut,
    total,
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
    created_at: string;
  }>(`SELECT id, icd11_code, name, description, urgency_level, created_at FROM diseases WHERE id = $1`, [
    id,
  ]);

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
