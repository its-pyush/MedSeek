import { describe, it, expect, vi, beforeEach } from "vitest";

import * as db from "../../db/helpers.js";
import * as nim from "../../services/ai/nim.js";
import * as ragService from "./rag.service.js";
import { sendMessage } from "./service.js";
import { env } from "../../config/env.js";

describe("AI Chat Message Flow & RAG Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    env.NVIDIA_API_KEY = "nvapi-mock-test-key";
  });

  describe("Deterministic Escalation", () => {
    it("runs escalation BEFORE any retrieval or LLM call and stops", async () => {
      // Mock session verification
      const querySpy = vi.spyOn(db, "query").mockImplementation(async (sql) => {
        if (sql.includes("SELECT id FROM chat_sessions")) {
          return { rows: [{ id: 10 }], command: "SELECT", rowCount: 1, oid: 0, fields: [] };
        }
        if (sql.includes("INSERT INTO chat_messages")) {
          return {
            rows: [
              {
                id: 1,
                session_id: 10,
                role: "assistant",
                content: "🚨 EMERGENCY ALERT",
                cited_record_ids: [],
                created_at: new Date().toISOString(),
              },
            ],
            command: "INSERT",
            rowCount: 1,
            oid: 0,
            fields: [],
          };
        }
        return { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] };
      });

      const retrieveSpy = vi.spyOn(ragService, "retrieve");
      const clientSpy = vi.spyOn(nim, "getNimClient");

      // Cardiac red-flag trigger: chest pain + sweating
      const emergencyMessage = "I have sudden severe chest pain and profuse sweating";
      const response = await sendMessage(10, 101, emergencyMessage);

      // Escalation must be triggered
      expect(response.escalation).not.toBeNull();
      expect(response.escalation?.triggered).toBe(true);
      expect(response.escalation?.level).toBe("emergency");
      expect(response.message.content).toContain("EMERGENCY ALERT");
      expect(response.disclaimer).toContain("Medical Disclaimer");

      // Critical safety check: neither retrieval nor LLM client were called
      expect(retrieveSpy).not.toHaveBeenCalled();
      expect(clientSpy).not.toHaveBeenCalled();
      expect(querySpy).toHaveBeenCalled();
    });
  });

  describe("Grounded Generation with Citations & Think Stripping", () => {
    it("retrieves records, passes them as numbered citations, strips think tags, and returns sources", async () => {
      // 1. Mock DB session & history
      vi.spyOn(db, "query").mockImplementation(async (sql, params) => {
        if (sql.includes("SELECT id FROM chat_sessions")) {
          return { rows: [{ id: 10 }], command: "SELECT", rowCount: 1, oid: 0, fields: [] };
        }
        if (sql.includes("SELECT role, content FROM chat_messages")) {
          return { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] };
        }
        if (sql.includes("INSERT INTO chat_messages")) {
          return {
            rows: [
              {
                id: 2,
                session_id: 10,
                role: "assistant",
                content: (params?.[1] as string) ?? "Mocked answer",
                cited_record_ids: [42],
                created_at: new Date().toISOString(),
              },
            ],
            command: "INSERT",
            rowCount: 1,
            oid: 0,
            fields: [],
          };
        }
        return { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] };
      });

      // 2. Mock RAG retrieval
      vi.spyOn(ragService, "retrieve").mockResolvedValue([
        {
          text: "[MEDICATION] name: Lisinopril, dosage: 10mg",
          source_type: "medication",
          source_id: 42,
          score: 0.89,
        },
      ]);

      // 3. Mock NIM client with reasoning tag output
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content:
                "<think>Patient takes Lisinopril for blood pressure.</think>According to your records [1], you take Lisinopril 10mg daily.",
            },
          },
        ],
      });

      vi.spyOn(nim, "getNimClient").mockReturnValue({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      } as unknown as ReturnType<typeof nim.getNimClient>);

      const response = await sendMessage(10, 101, "What blood pressure pill do I take?");

      // Verify retrieval was called with patientId and query
      expect(ragService.retrieve).toHaveBeenCalledWith(101, "What blood pressure pill do I take?", 5);

      // Verify LLM prompt contains citation [1] context and temperature is 0.2
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: env.LLM_MODEL,
          temperature: 0.2,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "system",
              content: expect.stringContaining("[1] (MEDICATION - Record ID: 42)"),
            }),
          ]),
        })
      );

      // Verify think tags were stripped from content
      expect(response.message.content).not.toContain("<think>");
      expect(response.message.content).toContain(
        "According to your records [1], you take Lisinopril 10mg daily."
      );

      // Verify cited sources returned
      expect(response.sources).toEqual([
        { source_id: 42, source_type: "medication" },
      ]);
    });
  });

  describe("Graceful Degradation on Failure", () => {
    it("degrades gracefully when RAG retrieval throws", async () => {
      // Mock session and history
      vi.spyOn(db, "query").mockImplementation(async (sql, params) => {
        if (sql.includes("SELECT id FROM chat_sessions")) {
          return { rows: [{ id: 10 }], command: "SELECT", rowCount: 1, oid: 0, fields: [] };
        }
        if (sql.includes("INSERT INTO chat_messages")) {
          return {
            rows: [
              {
                id: 3,
                session_id: 10,
                role: "assistant",
                content: (params?.[1] as string) ?? "Degraded response",
                cited_record_ids: [],
                created_at: new Date().toISOString(),
              },
            ],
            command: "INSERT",
            rowCount: 1,
            oid: 0,
            fields: [],
          };
        }
        return { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] };
      });

      // Simulate retrieval failure (e.g. pgvector query error or network timeout)
      vi.spyOn(ragService, "retrieve").mockRejectedValue(new Error("Database connection lost"));

      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: "I can offer general health information about headaches.",
            },
          },
        ],
      });

      vi.spyOn(nim, "getNimClient").mockReturnValue({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      } as unknown as ReturnType<typeof nim.getNimClient>);

      const response = await sendMessage(10, 101, "How to relieve headache?");

      // Should still succeed and inform the patient that records could not be retrieved
      expect(response.escalation).toBeNull();
      expect(mockCreate).toHaveBeenCalled();
      expect(response.message.content).toContain(
        "Note: Your medical records could not be retrieved at this time"
      );
      expect(response.disclaimer).toContain("Medical Disclaimer");
    });

    it("returns clean error message when LLM call fails", async () => {
      vi.spyOn(db, "query").mockImplementation(async (sql, params) => {
        if (sql.includes("SELECT id FROM chat_sessions")) {
          return { rows: [{ id: 10 }], command: "SELECT", rowCount: 1, oid: 0, fields: [] };
        }
        if (sql.includes("INSERT INTO chat_messages")) {
          return {
            rows: [
              {
                id: 4,
                session_id: 10,
                role: "assistant",
                content: (params?.[1] as string) ?? "Fallback",
                cited_record_ids: [],
                created_at: new Date().toISOString(),
              },
            ],
            command: "INSERT",
            rowCount: 1,
            oid: 0,
            fields: [],
          };
        }
        return { rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] };
      });

      vi.spyOn(ragService, "retrieve").mockResolvedValue([]);

      vi.spyOn(nim, "getNimClient").mockReturnValue({
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error("NIM server 500 error")),
          },
        },
      } as unknown as ReturnType<typeof nim.getNimClient>);

      const response = await sendMessage(10, 101, "Hello");

      expect(response.message.content).toContain(
        "I apologize, but I am currently unable to process your request due to a service issue"
      );
      expect(response.disclaimer).toContain("Medical Disclaimer");
    });
  });
});
