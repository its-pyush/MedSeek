/**
 * NVIDIA Build (NIM) AI client service.
 *
 * Provides a shared OpenAI-compatible client pointed at NVIDIA's API,
 * embedding helpers with batching and input_type flags, and resilient
 * exponential backoff retry logic for 429 rate limits and 5xx errors.
 */

import OpenAI from "openai";

import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";

// ─── Singleton Client ─────────────────────────────────────────────

let sharedClient: OpenAI | null = null;

/**
 * Get or initialize the shared NVIDIA NIM OpenAI-compatible client.
 */
export function getNimClient(): OpenAI {
  const apiKey = env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new AppError("NVIDIA_API_KEY is not configured", 503);
  }

  if (!sharedClient) {
    sharedClient = new OpenAI({
      apiKey,
      baseURL: env.NVIDIA_BASE_URL,
    });
  }

  return sharedClient;
}

/**
 * Override or reset the shared NIM client (useful for unit tests).
 */
export function setNimClient(client: OpenAI | null): void {
  sharedClient = client;
}

// ─── Retry with Exponential Backoff ──────────────────────────────

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Determines whether an error is transient and eligible for retry:
 * - 429 Too Many Requests (rate limit)
 * - 5xx Server Errors (500, 502, 503, 504)
 * - Transient network / connection errors
 */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as {
    status?: number;
    code?: string;
    name?: string;
    message?: string;
  };

  // Status-based checks (OpenAI API errors)
  if (typeof err.status === "number") {
    if (err.status === 429) return true;
    if (err.status >= 500 && err.status <= 599) return true;
  }

  // Name / code checks
  if (err.name === "RateLimitError" || err.name === "InternalServerError" || err.name === "APIConnectionError") {
    return true;
  }

  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") {
    return true;
  }

  // Message inspection fallback
  if (typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
      return true;
    }
  }

  return false;
}

/**
 * Execute an async operation with exponential backoff on 429 / 5xx errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleepFn ?? defaultSleep;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }

      // Exponential backoff with jitter: baseDelay * 2^attempt + jitter
      const jitter = Math.floor(Math.random() * 100);
      const delay = baseDelayMs * Math.pow(2, attempt) + jitter;

      await sleep(delay);
    }
  }

  throw lastError;
}

// ─── Embedding Helper ─────────────────────────────────────────────

export type EmbeddingInputType = "passage" | "query";

export interface EmbedOptions extends RetryOptions {
  batchSize?: number;
  client?: OpenAI;
}

/**
 * Generate 1024-dimensional embeddings using NVIDIA NIM nv-embedqa-e5-v5.
 *
 * Automatically:
 * - Batches inputs into chunks of `batchSize` (default 16).
 * - Passes the required `input_type` ("passage" for indexing, "query" for retrieval).
 * - Passes `truncate: "END"`.
 * - Retries each batch with exponential backoff on 429/5xx.
 * - Preserves original input ordering.
 */
export async function embed(
  texts: string[],
  type: EmbeddingInputType,
  options: EmbedOptions = {}
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const client = options.client ?? getNimClient();
  const batchSize = Math.max(1, options.batchSize ?? 16);
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const embeddings = await withRetry(
      async () => {
        // Cast request to include NVIDIA-specific input_type & truncate params
        const response = await client.embeddings.create({
          model: env.EMBED_MODEL,
          input: batch,
          ...({
            input_type: type,
            truncate: "END",
          } as Record<string, unknown>),
        } as unknown as OpenAI.EmbeddingCreateParams);

        // Sort by index to maintain original order
        return response.data
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding);
      },
      options
    );

    for (const vec of embeddings) {
      results.push(vec);
    }
  }

  return results;
}
