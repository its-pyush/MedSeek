/**
 * AI Chat Service — context-aware health AI powered by NVIDIA NIM & pgvector RAG.
 *
 * Uses RAG (Retrieval-Augmented Generation) grounded in the patient's
 * personal health records and profile via 1024-dimension pgvector embeddings.
 */

import { env } from "../../config/env.js";
import { query } from "../../db/helpers.js";
import { notFound } from "../../utils/AppError.js";
import { getNimClient, withRetry } from "../../services/ai/nim.js";
import { retrieve, RetrievedChunk } from "./rag.service.js";
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

export interface CitedSource {
  source_id: number;
  source_type: string;
}

export interface AIChatResponse {
  message: ChatMessage;
  escalation: EscalationResult | null;
  disclaimer: string;
  sources?: CitedSource[];
}

// ─── Reasoning Stripping ──────────────────────────────────────────

/**
 * Strip reasoning blocks (<think>...</think>) emitted by reasoning models
 * such as DeepSeek-R1 before saving to database and returning to the client.
 */
export function stripThinkTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
}

// ─── System Prompt ───────────────────────────────────────────────

function buildSystemPrompt(patientContext: string): string {
  return `You are MedSeek Health Assistant, an AI health advisor providing personalized, evidence-grounded health information.

CRITICAL CLINICAL & COMMUNICATION RULES:
1. You are NOT a doctor. NEVER provide definitive medical diagnoses or prescribe specific medications or dosages.
2. Ground all statements about the patient's personal medical history STRICTLY in the PATIENT CONTEXT below.
3. When referencing facts from the patient's records, cite the corresponding source using [n] (e.g. [1], [2]).
4. If the patient context has no relevant information for the patient's question, state explicitly that the patient's records do not contain this information (e.g., "Your records do not indicate...", "Based on your medical history on file, there is no mention of..."). Do not fabricate or assume medical history.
5. If symptoms suggest a severe or life-threatening emergency, IMMEDIATELY advise the user to contact emergency services (112/911) or visit the nearest emergency room.
6. Use cautious, empathetic, and objective language: "this could indicate", "you may want to discuss with your healthcare provider".
7. Keep responses concise, clear, and focused. Conclude with safe, practical next steps.

PATIENT CONTEXT:
${patientContext}`;
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
 * Send a user message and get an AI response grounded in the patient's vault.
 *
 * Flow:
 * 1. Check for red-flag escalation patterns (HARD STOP — runs before retrieval or AI)
 * 2. Store user message in history
 * 3. If escalated → store & return emergency alert immediately
 * 4. Retrieve top-k relevant health records via pgvector (cosine similarity)
 * 5. Build citation-indexed patient context (degrades gracefully if retrieval fails)
 * 6. Call NVIDIA NIM chat model with temperature ~0.2
 * 7. Strip <think>...</think> reasoning blocks from response
 * 8. Return response alongside cited sources and medical disclaimer
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

  // 1. Check for escalation BEFORE any retrieval or LLM call
  const escalation = checkEscalation(userContent);

  // 2. Store user message
  await query<ChatMessage>(
    `INSERT INTO chat_messages (session_id, role, content, cited_record_ids)
     VALUES ($1, 'user', $2, '[]'::jsonb)
     RETURNING id, session_id, role, content, cited_record_ids, created_at`,
    [sessionId, userContent]
  );

  // 3. Hard-stop escalation: return alert without invoking retrieval or AI
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
      sources: [],
    };
  }

  // 4. Retrieve relevant records via pgvector (RAG) with graceful degradation
  let retrievedChunks: RetrievedChunk[] = [];
  let retrievalFailed = false;

  try {
    retrievedChunks = await retrieve(patientId, userContent, 5);
  } catch (error) {
    retrievalFailed = true;
    console.error(
      "RAG retrieval failed, degrading gracefully:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  // 5. Build patient context for system prompt
  let patientContextText: string;
  const citedSources: CitedSource[] = [];
  const citedRecordIds: number[] = [];

  if (retrievalFailed) {
    patientContextText =
      "NOTICE: The patient's personal health records could not be retrieved at this time due to a temporary service issue. " +
      "You MUST inform the patient that their health records could not be loaded and answer using general health awareness.";
  } else if (retrievedChunks.length === 0) {
    patientContextText =
      "No relevant health records or history found in the patient's vault for this query. " +
      "Explicitly state that the patient's records do not contain information related to this question.";
  } else {
    patientContextText = retrievedChunks
      .map((chunk, index) => {
        citedSources.push({
          source_id: chunk.source_id,
          source_type: chunk.source_type,
        });
        if (chunk.source_type !== "profile" && !citedRecordIds.includes(chunk.source_id)) {
          citedRecordIds.push(chunk.source_id);
        }
        return `[${index + 1}] (${chunk.source_type.toUpperCase()} - Record ID: ${chunk.source_id}): ${chunk.text}`;
      })
      .join("\n");
  }

  // 6. Fetch conversation history (last 20 messages)
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

  // 7. Call NVIDIA NIM Chat completion
  let aiContent: string;

  try {
    const client = getNimClient();
    const systemPrompt = buildSystemPrompt(patientContextText);

    const completion = await withRetry(async () => {
      return client.chat.completions.create({
        model: env.LLM_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ],
        max_tokens: 4096,
        temperature: 0.2,
      });
    });

    const choice = completion.choices[0]?.message;
    const rawResponse = choice?.content ?? "";
    aiContent = stripThinkTags(rawResponse);

    // Fallback: If a reasoning model exhausted tokens before emitting to content,
    // extract drafted answer from reasoning_content if available
    if (!aiContent && (choice as unknown as { reasoning_content?: string })?.reasoning_content) {
      const reasoning = (choice as unknown as { reasoning_content: string }).reasoning_content;
      const draftMatch = reasoning.match(/(?:draft|response|final answer)[\s\S]*?["“]([\s\S]*?)["”]/i);
      if (draftMatch && draftMatch[1].trim().length > 30) {
        aiContent = draftMatch[1].trim();
      }
    }

    if (!aiContent) {
      aiContent = "I apologize, but I was unable to generate a response. Please try again.";
    }

    // Ensure graceful degradation is made clear to the patient if retrieval had failed
    if (
      retrievalFailed &&
      !aiContent.toLowerCase().includes("could not be loaded") &&
      !aiContent.toLowerCase().includes("unable to load") &&
      !aiContent.toLowerCase().includes("unable to retrieve")
    ) {
      aiContent = `⚠️ *Note: Your medical records could not be retrieved at this time. The following response is based on general health information.*\n\n${aiContent}`;
    }
  } catch (error) {
    console.error(
      "NIM Chat API error:",
      error instanceof Error ? error.message : "Service unavailable"
    );
    aiContent =
      "I apologize, but I am currently unable to process your request due to a service issue. " +
      "Please try again in a moment, or consult a healthcare professional directly if your " +
      "concern is urgent.";
  }

  // 8. Append recurring medical disclaimer
  const fullResponse = `${aiContent}\n\n---\n${getRecurringDisclaimer()}`;

  // 9. Store assistant response with cited records
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
    sources: citedSources,
  };
}
