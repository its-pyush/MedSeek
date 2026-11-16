import { describe, it, expect, vi, beforeEach } from "vitest";

import * as db from "../../db/helpers.js";
import {
  DONT_RULE_OUT_LIMIT,
  PREVALENCE_PRIOR,
  RankedRow,
  groupByRisk,
  resolveSymptom,
  searchDiseases,
  selectDontRuleOut,
} from "./service.js";
import { searchQuerySchema } from "./validation.js";

const pgResult = (rows: unknown[]) =>
  ({ rows, command: "SELECT", rowCount: rows.length, oid: 0, fields: [] }) as never;

function row(partial: Partial<RankedRow> & { id: number }): RankedRow {
  return {
    name: `Disease ${partial.id}`,
    description: null,
    urgency_level: "low",
    prevalence: "common",
    evidence: 1,
    score: 1,
    match_count: 1,
    has_key: false,
    matched_symptoms: [],
    total_symptoms: 5,
    ...partial,
  };
}

describe("symptom resolution order", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("prefers an exact synonym over any fuzzy name match", async () => {
    const spy = vi.spyOn(db, "query").mockImplementation(async (sql: string) => {
      if (sql.includes("FROM symptoms WHERE LOWER(name)")) return pgResult([]);
      if (sql.includes("LOWER(ss.synonym_text) = LOWER($1)")) {
        return pgResult([{ symptom_id: 7, name: "headache" }]);
      }
      throw new Error("fuzzy query must not run when a synonym matches exactly");
    });

    const result = await resolveSymptom("head pain");

    expect(result).toMatchObject({ matched_id: 7, matched_name: "headache", match_type: "synonym" });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("falls back to the best fuzzy candidate across names and synonyms", async () => {
    vi.spyOn(db, "query").mockImplementation(async (sql: string) => {
      if (sql.includes("UNION ALL")) return pgResult([{ id: 3, name: "dizziness", source: "fuzzy", sim: 0.5 }]);
      return pgResult([]);
    });

    const result = await resolveSymptom("dizzy");
    expect(result).toMatchObject({ matched_id: 3, match_type: "fuzzy" });
  });

  it("reports unmatched input", async () => {
    vi.spyOn(db, "query").mockResolvedValue(pgResult([]));
    const result = await resolveSymptom("qwertyuiop");
    expect(result).toMatchObject({ matched_id: null, match_type: "none" });
  });
});

describe("search query validation", () => {
  it("turns underscore ids into spaced phrases", () => {
    const parsed = searchQuerySchema.parse({ symptoms: "chest_pain, Spinning_Movements" });
    expect(parsed.symptoms).toEqual(["chest pain", "spinning movements"]);
  });
});

describe("don't rule out selection", () => {
  it("caps the list and never repeats a disease already shown", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ id: i + 1, urgency_level: "emergency", match_count: 2, evidence: 10 - i })
    );
    const picked = selectDontRuleOut(rows, new Set([1, 2]), 2);

    expect(picked).toHaveLength(DONT_RULE_OUT_LIMIT);
    expect(picked.map((r) => r.id)).toEqual([3, 4, 5]);
  });

  it("ignores non-urgent conditions", () => {
    const rows = [row({ id: 1, urgency_level: "moderate", match_count: 3 })];
    expect(selectDontRuleOut(rows, new Set(), 3)).toEqual([]);
  });

  it("needs two matched symptoms on a multi-symptom search", () => {
    const rows = [
      row({ id: 1, urgency_level: "emergency", match_count: 1, has_key: true }),
      row({ id: 2, urgency_level: "high", match_count: 2 }),
    ];
    expect(selectDontRuleOut(rows, new Set(), 3).map((r) => r.id)).toEqual([2]);
  });

  it("on a single-symptom search only warns when the symptom is a key sign", () => {
    const rows = [
      row({ id: 1, urgency_level: "emergency", has_key: false }),
      row({ id: 2, urgency_level: "emergency", has_key: true }),
    ];
    expect(selectDontRuleOut(rows, new Set(), 1).map((r) => r.id)).toEqual([2]);
  });
});

describe("searchDiseases ranking", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("ranks a common condition above a rare one with equal symptom evidence", async () => {
    vi.spyOn(db, "query").mockImplementation(async (sql: string) => {
      if (sql.includes("FROM symptoms WHERE LOWER(name)")) return pgResult([{ id: 1, name: "fever" }]);
      if (sql.includes("WITH q AS")) {
        const base = {
          description: null, match_count: "1", has_key: false,
          matched_symptoms: ["fever"], total_symptoms: "6", evidence: "2.0",
        };
        return pgResult([
          { ...base, id: 10, name: "Rare emergency", urgency_level: "emergency", prevalence: "rare" },
          { ...base, id: 11, name: "Common cold", urgency_level: "low", prevalence: "very_common" },
        ]);
      }
      return pgResult([]);
    });

    const result = await searchDiseases(["fever"], 20, 0);

    expect(result.results.map((r) => r.name)).toEqual(["Common cold", "Rare emergency"]);
    expect(result.results[0].score).toBeCloseTo(2.0 * PREVALENCE_PRIOR.very_common);
    expect(result.results[1].score).toBeCloseTo(2.0 * PREVALENCE_PRIOR.rare);
    expect(result.dont_rule_out).toEqual([]);
  });

  it("returns empty results when nothing resolves", async () => {
    vi.spyOn(db, "query").mockResolvedValue(pgResult([]));
    const result = await searchDiseases(["zzzz"], 20, 0);
    expect(result.total).toBe(0);
    expect(result.resolved_symptoms[0].match_type).toBe("none");
  });
});

describe("risk grouping of a results page", () => {
  it("orders low → moderate → high → emergency and keeps relevance order inside a tier", () => {
    const page = [
      row({ id: 1, urgency_level: "emergency" }),
      row({ id: 2, urgency_level: "low" }),
      row({ id: 3, urgency_level: "moderate" }),
      row({ id: 4, urgency_level: "low" }),
      row({ id: 5, urgency_level: "high" }),
    ];
    expect(groupByRisk(page).map((r) => r.id)).toEqual([2, 4, 3, 5, 1]);
  });
});
