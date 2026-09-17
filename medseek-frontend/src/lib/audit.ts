// MedSeek Audit API — access/activity log.

import { fetchWithAuth } from "./auth";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");

export interface AuditEntry {
  id: number;
  patient_id: number;
  action: string;
  target_table: string | null;
  target_id: number | null;
  success: boolean;
  timestamp: string;
}

export async function getAuditLog(options: {
  action?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ entries: AuditEntry[]; total: number }> {
  const params = new URLSearchParams();
  if (options.action) params.set("action", options.action);
  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));

  const res = await fetchWithAuth(`${API_BASE_URL}/api/audit/log?${params}`);
  if (!res.ok) throw new Error("Failed to load activity log");
  const data = await res.json();
  return { entries: data.data, total: data.meta.total };
}

export async function getAuditActions(): Promise<string[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/audit/actions`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data;
}
