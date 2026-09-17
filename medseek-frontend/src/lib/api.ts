// MedSeek Backend API Client
// All business logic lives in the backend — this is a thin HTTP client.

import { API_BASE_URL } from "./config";
export { API_BASE_URL };

// ─── Types ───────────────────────────────────────────────────────

export interface ResolvedSymptom {
  input: string;
  matched_name: string | null;
  matched_id: number | null;
  match_type: "exact" | "fuzzy" | "synonym" | "none";
}

export interface DiseaseResult {
  id: number;
  name: string;
  description: string | null;
  urgency_level: "low" | "moderate" | "high" | "emergency";
  score: number;
  matched_symptoms: string[];
  total_symptoms: number;
}

export interface SearchResponse {
  data: DiseaseResult[];
  dont_rule_out: DiseaseResult[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    resolved_symptoms: ResolvedSymptom[];
  };
}

export interface DiseaseDetail {
  id: number;
  icd11_code: string | null;
  name: string;
  description: string | null;
  urgency_level: "low" | "moderate" | "high" | "emergency";
  created_at: string;
  symptoms: Array<{
    id: number;
    name: string;
    weight: number;
  }>;
}

export interface AutocompleteItem {
  id: number;
  name: string;
  match_source: "canonical" | "synonym";
  matched_text: string;
  similarity: number;
}

// ─── API Functions ───────────────────────────────────────────────

export async function searchDiseases(
  symptoms: string[],
  limit = 20,
  offset = 0
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    symptoms: symptoms.join(","),
    limit: String(limit),
    offset: String(offset),
  });

  const res = await fetch(`${API_BASE_URL}/api/search?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Search failed" } }));
    throw new Error(err.error?.message || `Search failed with status ${res.status}`);
  }

  return res.json();
}

export async function getDiseaseById(id: number): Promise<{ data: DiseaseDetail }> {
  const res = await fetch(`${API_BASE_URL}/api/search/diseases/${id}`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Disease not found");
    }
    const err = await res.json().catch(() => ({ error: { message: "Failed to load disease" } }));
    throw new Error(err.error?.message || `Failed with status ${res.status}`);
  }

  return res.json();
}

export async function autocompleteSymptoms(
  query: string,
  limit = 10
): Promise<{ data: AutocompleteItem[] }> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });

  const res = await fetch(`${API_BASE_URL}/api/search/symptoms/autocomplete?${params}`);
  if (!res.ok) {
    return { data: [] }; // Graceful degradation — autocomplete shouldn't break the UI
  }

  return res.json();
}
