// MedSeek Chat API — AI health chat session management.

import { fetchWithAuth } from "./auth";
import { API_BASE_URL } from "./config";

export interface ChatSession {
  id: number;
  patient_id: number;
  started_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  cited_record_ids: number[];
  created_at: string;
}

export interface EscalationResult {
  triggered: boolean;
  level: "emergency" | "urgent" | "none";
  ruleName: string | null;
  message: string | null;
}

export interface AIChatResponse {
  message: ChatMessage;
  escalation: EscalationResult | null;
  disclaimer: string;
}

export async function createChatSession(): Promise<ChatSession> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/ai/sessions`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to create chat session");
  const data = await res.json();
  return data.data;
}

export async function listChatSessions(
  limit = 20,
  offset = 0
): Promise<{ sessions: ChatSession[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetchWithAuth(`${API_BASE_URL}/api/ai/sessions?${params}`);
  if (!res.ok) throw new Error("Failed to list sessions");
  const data = await res.json();
  return { sessions: data.data, total: data.meta.total };
}

export async function getChatSession(
  sessionId: number
): Promise<{ session: ChatSession; messages: ChatMessage[] }> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/ai/sessions/${sessionId}`);
  if (!res.ok) throw new Error("Failed to load chat session");
  const data = await res.json();
  return data.data;
}

export async function sendChatMessage(
  sessionId: number,
  content: string
): Promise<AIChatResponse> {
  const res = await fetchWithAuth(
    `${API_BASE_URL}/api/ai/sessions/${sessionId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Failed to send message" } }));
    throw new Error(err.error?.message || "Failed to send message");
  }
  const data = await res.json();
  return data.data;
}
