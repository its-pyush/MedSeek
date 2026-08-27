/**
 * AI Chat Service — context-aware health AI powered by Deepseek.
 *
 * Uses RAG (Retrieval-Augmented Generation) to ground responses
 * in the patient's stored health profile and conditions.
 */

import OpenAI from "openai";

import { env } from "../../config/env.js";
import { query } from "../../db/helpers.js";
import { notFound, AppError } from "../../utils/AppError.js";
import { decrypt } from "../vault/encryption.js";
import { checkEscalation, getRecurringDisclaimer, EscalationResult } from "./escalation.js";

// ─── Types ───────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  cited_record_ids: number[];
  created_at: string;
}

export interface ChatSession {
  id: number;
  patient_id: number;
  started_at: string;
}

export interface AIChatResponse {
  message: ChatMessage;
  escalation: EscalationResult | null;
  disclaimer: string;
}

// ─── Deepseek Client ─────────────────────────────────────────────

function getDeepseekClient(): OpenAI {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new AppError("DEEPSEEK_API_KEY is not configured", 503);
  }
  return new OpenAI({
    apiKey,
    baseURL: env.DEEPSEEK_BASE_URL,
  });
}

// ─── RAG Context Building ────────────────────────────────────────

/**
 * Build the patient context string from their profile and health records.
 * This becomes the system prompt grounding for the AI.
 */
async function buildPatientContext(patientId: number): Promise<{
  context: string;
  citedRecordIds: number[];
}> {
  // Fetch patient profile
  const profileResult = await query<{
    email: string;
    age: number | null;
    sex: string | null;
    pregnancy_status: boolean | null;
    existing_conditions: string[];
  }>(
    `SELECT p.email, pp.age, pp.sex, pp.pregnancy_status,
            COALESCE(pp.existing_conditions, '[]'::jsonb) AS existing_conditions
     FROM patients p
     LEFT JOIN patient_profiles pp ON pp.patient_id = p.id
     WHERE p.id = $1`,
    [patientId]
  );

  if (profileResult.rows.length === 0) {
    return { context: "No patient profile available.", citedRecordIds: [] };
  }

  const profile = profileResult.rows[0];
  const citedRecordIds: number[] = [];

  let context = "## Patient Profile\n";
  if (profile.age) context += `- Age: ${profile.age}\n`;
  if (profile.sex) context += `- Sex: ${profile.sex}\n`;
  if (profile.pregnancy_status) context += `- Currently pregnant: Yes\n`;
  if (profile.existing_conditions && profile.existing_conditions.length > 0) {
    context += `- Existing conditions: ${profile.existing_conditions.join(", ")}\n`;
  }

  // Fetch recent health records and decrypt for RAG context
  const recordsResult = await query<{ id: number; record_type: string; encrypted_data: Buffer }>(
    `SELECT id, record_type, encrypted_data FROM health_records
     WHERE patient_id = $1
     ORDER BY updated_at DESC LIMIT 20`,
    [patientId]
  );

  if (recordsResult.rows.length > 0) {
    context += "\n## Health Records on File\n";
    for (const record of recordsResult.rows) {
      citedRecordIds.push(record.id);
      try {
        const decrypted = decrypt(record.encrypted_data);
        const data = JSON.parse(decrypted);
        const summary = Object.entries(data)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ");
        context += `- ${record.record_type} (ID: ${record.id}): ${summary}\n`;
      } catch {
        // Fallback if decryption fails (e.g., ENCRYPTION_KEY changed)
        context += `- ${record.record_type} record (ID: ${record.id}) [unable to decrypt]\n`;
      }
    }
  }

  return { context, citedRecordIds };
}

// ─── System Prompt ───────────────────────────────────────────────

function buildSystemPrompt(patientContext: string): string {
  return `You are MedSeek Health Assistant, an AI health advisor that provides personalized health information grounded in the patient's own medical history.

CRITICAL RULES:
1. You are NOT a doctor. Always remind the user to consult a healthcare professional for medical decisions.
2. NEVER diagnose conditions definitively. Use language like "this could indicate", "you may want to discuss with your doctor".
3. When referencing the patient's data, cite what information you're using.
4. If symptoms suggest an emergency, IMMEDIATELY direct the user to emergency services.
5. Do not prescribe medications or recommend specific dosages.
6. If you don't have enough information, ask clarifying questions.
7. Keep responses concise but thorough — avoid walls of text.

PATIENT CONTEXT (use this to personalize your responses):
${patientContext}

Always end your response by suggesting relevant next steps (see a doctor, monitor symptoms, etc.).`;
}

// ─── Chat Session Management ─────────────────────────────────────

/**
 * Create a new chat session for a patient.
 */
export async function createSession(patientId: number): Promise<ChatSession> {
  const result = await query<ChatSession>(
    `INSERT INTO chat_sessions (patient_id) VALUES ($1) RETURNING id, patient_id, started_at`,
    [patientId]
  );
  return result.rows[0];
}

/**
 * List chat sessions for a patient.
 */
export async function listSessions(
  patientId: number,
  limit: number,
  offset: number
): Promise<{ sessions: ChatSession[]; total: number }> {
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) FROM chat_sessions WHERE patient_id = $1`,
    [patientId]
  );

  const result = await query<ChatSession>(
    `SELECT id, patient_id, started_at
     FROM chat_sessions WHERE patient_id = $1
     ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
    [patientId, limit, offset]
  );

  return {
    sessions: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

/**
 * Get a specific chat session with message history.
 */
export async function getSessionWithMessages(
  sessionId: number,
  patientId: number
): Promise<{ session: ChatSession; messages: ChatMessage[] }> {
  const sessionResult = await query<ChatSession>(
    `SELECT id, patient_id, started_at FROM chat_sessions WHERE id = $1 AND patient_id = $2`,
    [sessionId, patientId]
  );

  if (sessionResult.rows.length === 0) {
    throw notFound("Chat session not found");
  }

  const messagesResult = await query<ChatMessage>(
    `SELECT id, session_id, role, content, cited_record_ids, created_at
     FROM chat_messages WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );

  return {
    session: sessionResult.rows[0],
    messages: messagesResult.rows,
  };
}

// ─── Send Message ────────────────────────────────────────────────

/**
 * Send a user message and get an AI response.
 *
 * Flow:
 * 1. Check for red-flag escalation patterns
 * 2. If escalation triggered → return escalation message (hard stop)
 * 3. Build patient context (RAG retrieval)
 * 4. Build conversation history
 * 5. Call Deepseek API
 * 6. Store both user message and AI response
 * 7. Return response with disclaimer
 */
export async function sendMessage(
  sessionId: number,
  patientId: number,
  userContent: string
): Promise<AIChatResponse> {
  // Verify session belongs to patient
  const sessionCheck = await query<{ id: number }>(
    `SELECT id FROM chat_sessions WHERE id = $1 AND patient_id = $2`,
    [sessionId, patientId]
  );

  if (sessionCheck.rows.length === 0) {
    throw notFound("Chat session not found");
  }

  // 1. Check for escalation
  const escalation = checkEscalation(userContent);

  // 2. Store user message
  await query<ChatMessage>(
    `INSERT INTO chat_messages (session_id, role, content, cited_record_ids)
     VALUES ($1, 'user', $2, '[]'::jsonb)
     RETURNING id, session_id, role, content, cited_record_ids, created_at`,
    [sessionId, userContent]
  );

  // 3. If escalation triggered, return escalation response without calling AI
  if (escalation.triggered) {
    const escalationContent = `🚨 **${escalation.level === "emergency" ? "EMERGENCY" : "URGENT"} ALERT**\n\n${escalation.message}\n\n${getRecurringDisclaimer()}`;

    const aiMsgResult = await query<ChatMessage>(
      `INSERT INTO chat_messages (session_id, role, content, cited_record_ids)
       VALUES ($1, 'assistant', $2, '[]'::jsonb)
       RETURNING id, session_id, role, content, cited_record_ids, created_at`,
      [sessionId, escalationContent]
    );

    return {
      message: aiMsgResult.rows[0],
      escalation,
      disclaimer: getRecurringDisclaimer(),
    };
  }

  // 4. Build patient context (RAG)
  const { context: patientContext, citedRecordIds } =
    await buildPatientContext(patientId);

  // 5. Fetch conversation history (last 20 messages for context window)
  const historyResult = await query<{ role: string; content: string }>(
    `SELECT role, content FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [sessionId]
  );

  const conversationHistory = historyResult.rows
    .reverse()
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // 6. Call Deepseek API
  let aiContent: string;

  try {
    const client = getDeepseekClient();
    const systemPrompt = buildSystemPrompt(patientContext);

    const completion = await client.chat.completions.create({
      model: env.DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
      ],
      max_tokens: 1024,
      temperature: 0.7,
    });

    aiContent = completion.choices[0]?.message?.content ?? "I apologize, but I was unable to generate a response. Please try again.";
  } catch (error) {
    // Fallback if API is unavailable
    console.error("Deepseek API error:", error);
    aiContent =
      "I apologize, but I'm currently unable to process your request due to a service issue. " +
      "Please try again in a moment, or consult a healthcare professional directly if your " +
      "concern is urgent.\n\n" + getRecurringDisclaimer();
  }

  // Append disclaimer
  const fullResponse = `${aiContent}\n\n---\n${getRecurringDisclaimer()}`;

  // 7. Store AI response
  const aiMsgResult = await query<ChatMessage>(
    `INSERT INTO chat_messages (session_id, role, content, cited_record_ids)
     VALUES ($1, 'assistant', $2, $3::jsonb)
     RETURNING id, session_id, role, content, cited_record_ids, created_at`,
    [sessionId, fullResponse, JSON.stringify(citedRecordIds)]
  );

  return {
    message: aiMsgResult.rows[0],
    escalation: null,
    disclaimer: getRecurringDisclaimer(),
  };
}
