import { describe, it, expect, vi, beforeEach } from "vitest";

import * as db from "../../db/helpers.js";
import { searchDiseases, PREVALENCE_PRIOR } from "../search/service.js";
import { searchQuerySchema } from "../search/validation.js";
import { parseCell } from "./geo.js";
import { MAX_BOOST, MIN_CASES, getLocalSignals, localBoost } from "./service.js";

const pgResult = (rows: unknown[]) =>
  ({ rows, command: "SELECT", rowCount: rows.length, oid: 0, fields: [] }) as never;

describe("area cells", () => {
  it("accepts a half-degree corner and returns half-degree indices", () => {
    expect(parseCell("19.0,72.5")).toEqual({ lat: 38, lon: 145 });
    expect(parseCell("-33.5,-70.5")).toEqual({ lat: -67, lon: -141 });
  });

  it("rejects anything more precise than half a degree", () => {
    expect(parseCell("19.076,72.877")).toBeNull();
    expect(parseCell("19.25,72.5")).toBeNull();
  });

  it("rejects malformed and out-of-range values", () => {
    expect(parseCell("abc")).toBeNull();
    expect(parseCell("19.0")).toBeNull();
    expect(parseCell("95.0,10.0")).toBeNull();
    expect(parseCell("10.0,180.0")).toBeNull();
  });

  it("is validated on the search query", () => {
    expect(searchQuerySchema.parse({ symptoms: "fever", cell: "19.0,72.5" }).cell).toEqual({ lat: 38, lon: 145 });
    expect(searchQuerySchema.parse({ symptoms: "fever" }).cell).toBeUndefined();
    expect(searchQuerySchema.safeParse({ symptoms: "fever", cell: "19.07,72.87" }).success).toBe(false);
  });
});

describe("local boost", () => {
  it("does nothing below the minimum number of cases", () => {
    expect(localBoost(0, 0)).toBe(1);
    expect(localBoost(MIN_CASES - 1, 0)).toBe(1);
  });

  it("rises with cases above the usual level", () => {
    expect(localBoost(5, 0)).toBeCloseTo(2); // (5+5)/(0+5)
    expect(localBoost(10, 5)).toBeCloseTo(1.5); // (10+5)/(5+5)
  });

  it("is capped", () => {
    expect(localBoost(40, 0)).toBe(MAX_BOOST);
    expect(localBoost(10_000, 0)).toBe(MAX_BOOST);
  });

  it("never lowers a condition, even when cases are below the usual level", () => {
    expect(localBoost(6, 50)).toBe(1);
  });
});

describe("local signal in search", () => {
  beforeEach(() => vi.restoreAllMocks());

  const ranking = (sql: string) => {
    if (sql.includes("FROM symptoms WHERE LOWER(name)")) return pgResult([{ id: 1, name: "fever" }]);
    if (sql.includes("WITH q AS")) {
      const base = {
        description: null, match_count: "1", has_key: false, urgency_level: "moderate",
        matched_symptoms: ["fever"], total_symptoms: "6", prevalence: "common",
      };
      return pgResult([
        { ...base, id: 10, name: "Influenza (flu)", evidence: "2.0" },
        { ...base, id: 11, name: "Dengue fever", evidence: "1.5" },
      ]);
    }
    return null;
  };

  it("moves a condition up when it is being diagnosed nearby", async () => {
    vi.spyOn(db, "query").mockImplementation(async (sql: string) => {
      if (sql.includes("FROM case_reports")) {
        return pgResult([{ disease_name: "Dengue fever", recent: 40, earlier: 0, recent_sample: 40 }]);
      }
      return ranking(sql) ?? pgResult([]);
    });

    const without = await searchDiseases(["fever"], 20, 0);
    expect(without.results.map((r) => r.name)).toEqual(["Influenza (flu)", "Dengue fever"]);
    expect(without.results.every((r) => r.local_signal === undefined)).toBe(true);

    const withArea = await searchDiseases(["fever"], 20, 0, { cell: { lat: 38, lon: 145 } });
    expect(withArea.results.map((r) => r.name)).toEqual(["Dengue fever", "Influenza (flu)"]);
    expect(withArea.results[0].score).toBeCloseTo(1.5 * PREVALENCE_PRIOR.common * MAX_BOOST);
    expect(withArea.results[0].local_signal).toMatchObject({ cases: 40, simulated: true, window_days: 28 });
    expect(withArea.results[1].local_signal).toBeUndefined();
  });

  it("still returns results when the cases table is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "query").mockImplementation(async (sql: string) => {
      if (sql.includes("FROM case_reports")) throw new Error('relation "case_reports" does not exist');
      return ranking(sql) ?? pgResult([]);
    });

    const result = await searchDiseases(["fever"], 20, 0, { cell: { lat: 38, lon: 145 } });
    expect(result.results.map((r) => r.name)).toEqual(["Influenza (flu)", "Dengue fever"]);
  });

  it("leaves out conditions with too few cases", async () => {
    vi.spyOn(db, "query").mockResolvedValue(
      pgResult([{ disease_name: "Malaria", recent: 3, earlier: 0, recent_sample: 0 }])
    );
    const signals = await getLocalSignals(["Malaria"], { lat: 38, lon: 145 });
    expect(signals.size).toBe(0);
  });
});
