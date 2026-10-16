import { describe, it, expect, vi, beforeEach } from "vitest";

import * as db from "../../db/helpers.js";
import * as nim from "../../services/ai/nim.js";
import * as vaultService from "../vault/service.js";
import { env } from "../../config/env.js";
import {
  retrieve,
  syncVaultRecord,
  deleteVaultRecordChunk,
  syncPatientProfile,
  formatVaultRecordForEmbedding,
  formatPatientProfileForEmbedding,
} from "./rag.service.js";

describe("RAG Service & Patient Isolation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    env.NVIDIA_API_KEY = "nvapi-mock-test-key";
  });

  describe("Formatting Helpers", () => {
    it("formats vault records with capitalized type and key-value fields", () => {
      const formatted = formatVaultRecordForEmbedding("medication", {
        name: "Metformin",
        dosage: "500mg",
        frequency: "twice daily",
      });
      expect(formatted).toBe(
        "[MEDICATION] name: Metformin, dosage: 500mg, frequency: twice daily"
      );
    });

    it("formats compact patient profile demographics", () => {
      const formatted = formatPatientProfileForEmbedding({
        age: 45,
        sex: "female",
        pregnancy_status: true,
        existing_conditions: ["Asthma", "Eczema"],
      });

      expect(formatted).toBe(
        "[PATIENT PROFILE] Age: 45; Sex: female; Currently pregnant: Yes; Existing conditions: Asthma, Eczema"
      );
    });

    it("returns null for completely empty patient profiles", () => {
      expect(
        formatPatientProfileForEmbedding({
          age: null,
          sex: null,
          pregnancy_status: false,
          existing_conditions: [],
        })
      ).toBeNull();
    });
  });

  describe("Patient Isolation in Retrieval", () => {
    it("ensures retrieval query strictly filters by authenticated patientId", async () => {
      // Mock embedding query
      vi.spyOn(nim, "embed").mockResolvedValue([[0.1, 0.2, 0.3]]);

      // Spy on database query
      const querySpy = vi.spyOn(db, "query").mockImplementation(async (sql, params) => {
        // Assert that the SQL strictly contains WHERE patient_id = $2
        expect(sql).toContain("WHERE patient_id = $2");
        expect(params?.[1]).toBe(101); // Patient A's ID

        return {
          rows: [
            { source_type: "medication", source_id: 1, score: 0.88 },
          ],
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
        };
      });

      // Mock vault decryption
      vi.spyOn(vaultService, "getRecord").mockResolvedValue({
        id: 1,
        patient_id: 101,
        record_type: "medication",
        data: { name: "Metformin", dosage: "500mg" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const results = await retrieve(101, "What medication do I take?");

      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].source_id).toBe(1);
      expect(results[0].text).toContain("Metformin");
    });

    it("never returns chunks belonging to Patient B when Patient A queries", async () => {
      vi.spyOn(nim, "embed").mockResolvedValue([[0.5, 0.5]]);

      // Simulate DB returning records ONLY for the requested patient_id
      vi.spyOn(db, "query").mockImplementation(async (_sql, params) => {
        const requestedPatientId = params?.[1];

        if (requestedPatientId === 999) {
          // Patient B's records
          return {
            rows: [
              { source_type: "condition", source_id: 200, score: 0.95 },
            ],
            command: "SELECT",
            rowCount: 1,
            oid: 0,
            fields: [],
          };
        }

        // Patient A has no matching records
        return {
          rows: [],
          command: "SELECT",
          rowCount: 0,
          oid: 0,
          fields: [],
        };
      });

      // Patient A (id: 101) queries
      const resultsForPatientA = await retrieve(101, "Do I have hypertension?");
      expect(resultsForPatientA).toHaveLength(0);

      // Patient B (id: 999) queries
      vi.spyOn(vaultService, "getRecord").mockResolvedValue({
        id: 200,
        patient_id: 999,
        record_type: "condition",
        data: { diagnosis: "Hypertension" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const resultsForPatientB = await retrieve(999, "Do I have hypertension?");
      expect(resultsForPatientB).toHaveLength(1);
      expect(resultsForPatientB[0].source_id).toBe(200);
    });

    it("filters out chunks below minimum similarity threshold", async () => {
      vi.spyOn(nim, "embed").mockResolvedValue([[0.1, 0.2]]);

      vi.spyOn(db, "query").mockResolvedValue({
        rows: [
          { source_type: "medication", source_id: 1, score: 0.85 },
          { source_type: "allergy", source_id: 2, score: 0.42 }, // below 0.5 threshold
        ],
        command: "SELECT",
        rowCount: 2,
        oid: 0,
        fields: [],
      });

      vi.spyOn(vaultService, "getRecord").mockResolvedValue({
        id: 1,
        patient_id: 101,
        record_type: "medication",
        data: { name: "Aspirin" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const results = await retrieve(101, "Aspirin dosage", 5, 0.5);

      expect(results).toHaveLength(1);
      expect(results[0].source_id).toBe(1);
    });
  });

  describe("Index Sync on Vault CRUD", () => {
    it("syncVaultRecord deletes existing chunk and inserts new embedding", async () => {
      vi.spyOn(nim, "embed").mockResolvedValue([[0.1, 0.2, 0.3]]);
      const querySpy = vi.spyOn(db, "query").mockResolvedValue({
        rows: [],
        command: "DELETE",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await syncVaultRecord(101, 5, "medication", { name: "Amoxicillin" });

      // First query should delete old chunk
      expect(querySpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("DELETE FROM rag_chunks"),
        [101, 5]
      );

      // Second query should insert new vector
      expect(querySpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("INSERT INTO rag_chunks"),
        [101, "medication", 5, "[0.1,0.2,0.3]"]
      );
    });

    it("deleteVaultRecordChunk removes chunk from database", async () => {
      const querySpy = vi.spyOn(db, "query").mockResolvedValue({
        rows: [],
        command: "DELETE",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await deleteVaultRecordChunk(101, 42);

      expect(querySpy).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM rag_chunks"),
        [101, 42]
      );
    });

    it("syncPatientProfile updates demographic chunk", async () => {
      vi.spyOn(nim, "embed").mockResolvedValue([[0.7, 0.8, 0.9]]);
      const querySpy = vi.spyOn(db, "query").mockResolvedValue({
        rows: [],
        command: "DELETE",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await syncPatientProfile(101, {
        age: 30,
        sex: "male",
        existing_conditions: ["Asthma"],
      });

      expect(querySpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("DELETE FROM rag_chunks WHERE patient_id = $1 AND source_type = 'profile'"),
        [101]
      );

      expect(querySpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("INSERT INTO rag_chunks"),
        [101, "[0.7,0.8,0.9]"]
      );
    });
  });
});
