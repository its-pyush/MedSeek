// MedSeek Vault API — encrypted health record management.

import { fetchWithAuth } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type RecordType = "condition" | "medication" | "allergy" | "report";

export interface HealthRecord {
  id: number;
  patient_id: number;
  record_type: RecordType;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HealthRecordSummary {
  id: number;
  record_type: RecordType;
  created_at: string;
  updated_at: string;
}

export async function listRecords(
  type?: RecordType,
  limit = 50,
  offset = 0
): Promise<{ records: HealthRecordSummary[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (type) params.set("type", type);
  const res = await fetchWithAuth(`${API_BASE_URL}/api/vault/records?${params}`);
  if (!res.ok) throw new Error("Failed to list records");
  const data = await res.json();
  return { records: data.data, total: data.meta.total };
}

export async function getRecord(id: number): Promise<HealthRecord> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/vault/records/${id}`);
  if (!res.ok) throw new Error("Failed to load record");
  const data = await res.json();
  return data.data;
}

export async function createRecord(
  recordType: RecordType,
  recordData: Record<string, unknown>
): Promise<HealthRecord> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/vault/records`, {
    method: "POST",
    body: JSON.stringify({ record_type: recordType, data: recordData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Failed to create record" } }));
    throw new Error(err.error?.message || "Failed to create record");
  }
  const data = await res.json();
  return data.data;
}

export async function updateRecord(
  id: number,
  recordData: Record<string, unknown>
): Promise<HealthRecord> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/vault/records/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data: recordData }),
  });
  if (!res.ok) throw new Error("Failed to update record");
  const data = await res.json();
  return data.data;
}

export async function deleteRecord(id: number): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/vault/records/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete record");
}
