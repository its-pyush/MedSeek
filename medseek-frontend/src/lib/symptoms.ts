// The full symptom list from the backend, loaded once per page visit and shared
// by the symptom browser and the 3D body (which lights up the areas a symptom
// belongs to). All matching and ranking of conditions stays in the backend;
// this is only the vocabulary.

import { useEffect, useState } from "react";
import { API_BASE_URL } from "./config";

export interface CatalogSymptom {
  name: string;
  synonyms: string[];
  /** Number of conditions that list this symptom. */
  diseaseCount: number;
  /** Body picker area/part ids, or "general" / "skin" / "mind". */
  bodyAreas: string[];
}

export interface SymptomCatalog {
  symptoms: CatalogSymptom[];
  /** Symptom name or synonym (lower case) → body areas. */
  areasByTerm: Record<string, string[]>;
}

interface ApiSymptom {
  name: string;
  synonyms: string[] | null;
  disease_count: number;
  body_areas: string[] | null;
}

let cached: Promise<SymptomCatalog> | null = null;

export function loadSymptomCatalog(): Promise<SymptomCatalog> {
  if (!cached) {
    cached = fetch(`${API_BASE_URL}/api/search/symptoms`)
      .then((res) => {
        if (!res.ok) throw new Error(`Symptom list failed with status ${res.status}`);
        return res.json() as Promise<{ data: ApiSymptom[] }>;
      })
      .then(({ data }) => {
        const symptoms: CatalogSymptom[] = data.map((s) => ({
          name: s.name,
          synonyms: s.synonyms ?? [],
          diseaseCount: s.disease_count,
          bodyAreas: s.body_areas ?? [],
        }));
        const areasByTerm: Record<string, string[]> = {};
        // Synonyms first so a canonical name always wins a clash.
        for (const s of symptoms) for (const syn of s.synonyms) areasByTerm[syn.toLowerCase()] = s.bodyAreas;
        for (const s of symptoms) areasByTerm[s.name.toLowerCase()] = s.bodyAreas;
        return { symptoms, areasByTerm };
      })
      .catch((err) => {
        cached = null; // allow a retry
        throw err;
      });
  }
  return cached;
}

/** The catalog once it has loaded; null while loading or if the request failed. */
export function useSymptomCatalog(): SymptomCatalog | null {
  const [catalog, setCatalog] = useState<SymptomCatalog | null>(null);
  useEffect(() => {
    let alive = true;
    loadSymptomCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return catalog;
}
