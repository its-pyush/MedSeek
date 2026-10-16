import { describe, it, expect, vi, beforeEach } from "vitest";
import OpenAI from "openai";

import { embed, withRetry, isRetryableError } from "./nim.js";

describe("NIM Client & Retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isRetryableError", () => {
    it("identifies 429 rate limit errors as retryable", () => {
      expect(isRetryableError({ status: 429 })).toBe(true);
      expect(isRetryableError({ message: "Rate limit exceeded (429)" })).toBe(true);
      expect(isRetryableError({ name: "RateLimitError" })).toBe(true);
    });

    it("identifies 5xx server errors as retryable", () => {
      expect(isRetryableError({ status: 500 })).toBe(true);
      expect(isRetryableError({ status: 502 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
      expect(isRetryableError({ status: 504 })).toBe(true);
      expect(isRetryableError({ name: "InternalServerError" })).toBe(true);
    });

    it("identifies connection errors as retryable", () => {
      expect(isRetryableError({ code: "ECONNRESET" })).toBe(true);
      expect(isRetryableError({ code: "ETIMEDOUT" })).toBe(true);
      expect(isRetryableError({ name: "APIConnectionError" })).toBe(true);
    });

    it("does not retry 400 Bad Request or 401 Unauthorized", () => {
      expect(isRetryableError({ status: 400 })).toBe(false);
      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError({ status: 404 })).toBe(false);
      expect(isRetryableError(new Error("Invalid JSON input"))).toBe(false);
    });
  });

  describe("withRetry", () => {
    it("returns result on first attempt if successful", async () => {
      const mockFn = vi.fn().mockResolvedValue("success");
      const sleepFn = vi.fn();

      const result = await withRetry(mockFn, { sleepFn });
      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(sleepFn).not.toHaveBeenCalled();
    });

    it("retries on 429 rate limit and succeeds", async () => {
      const rateLimitErr = { status: 429, message: "Too many requests" };
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(rateLimitErr)
        .mockResolvedValueOnce("recovered");
      const sleepFn = vi.fn().mockResolvedValue(undefined);

      const result = await withRetry(mockFn, { maxRetries: 3, baseDelayMs: 100, sleepFn });
      expect(result).toBe("recovered");
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(sleepFn).toHaveBeenCalledTimes(1);
    });

    it("retries on 503 server error and succeeds", async () => {
      const serverErr = { status: 503, message: "Service Unavailable" };
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(serverErr)
        .mockResolvedValueOnce("ok");
      const sleepFn = vi.fn().mockResolvedValue(undefined);

      const result = await withRetry(mockFn, { maxRetries: 2, baseDelayMs: 50, sleepFn });
      expect(result).toBe("ok");
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(sleepFn).toHaveBeenCalledTimes(1);
    });

    it("does not retry non-retryable 401 errors", async () => {
      const authErr = { status: 401, message: "Invalid API key" };
      const mockFn = vi.fn().mockRejectedValue(authErr);
      const sleepFn = vi.fn();

      await expect(withRetry(mockFn, { sleepFn })).rejects.toEqual(authErr);
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(sleepFn).not.toHaveBeenCalled();
    });

    it("throws when maxRetries are exhausted", async () => {
      const rateLimitErr = { status: 429, message: "Too many requests" };
      const mockFn = vi.fn().mockRejectedValue(rateLimitErr);
      const sleepFn = vi.fn().mockResolvedValue(undefined);

      await expect(
        withRetry(mockFn, { maxRetries: 2, baseDelayMs: 10, sleepFn })
      ).rejects.toEqual(rateLimitErr);
      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(sleepFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("embed helper", () => {
    it("returns empty array when input is empty", async () => {
      const result = await embed([], "passage");
      expect(result).toEqual([]);
    });

    it("batches inputs and passes required input_type and truncate parameters", async () => {
      const mockCreate = vi.fn().mockImplementation((params) => {
        const inputs: string[] = params.input;
        return Promise.resolve({
          data: inputs.map((_, i) => ({
            index: i,
            embedding: [0.1, 0.2, 0.3],
          })),
        });
      });

      const mockClient = {
        embeddings: {
          create: mockCreate,
        },
      } as unknown as OpenAI;

      const texts = ["t1", "t2", "t3", "t4", "t5"];
      const results = await embed(texts, "passage", {
        batchSize: 2,
        client: mockClient,
      });

      // 5 items with batch size 2 -> 3 calls (2, 2, 1)
      expect(mockCreate).toHaveBeenCalledTimes(3);
      expect(mockCreate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: ["t1", "t2"],
          input_type: "passage",
          truncate: "END",
        })
      );
      expect(mockCreate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: ["t3", "t4"],
          input_type: "passage",
          truncate: "END",
        })
      );
      expect(mockCreate).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          input: ["t5"],
          input_type: "passage",
          truncate: "END",
        })
      );

      expect(results).toHaveLength(5);
      expect(results[0]).toEqual([0.1, 0.2, 0.3]);
    });

    it("handles query type correctly", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        data: [{ index: 0, embedding: [0.9, 0.8, 0.7] }],
      });

      const mockClient = {
        embeddings: {
          create: mockCreate,
        },
      } as unknown as OpenAI;

      const results = await embed(["symptoms of asthma"], "query", {
        client: mockClient,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: ["symptoms of asthma"],
          input_type: "query",
          truncate: "END",
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual([0.9, 0.8, 0.7]);
    });
  });
});
