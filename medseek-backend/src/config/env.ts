import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Auth
  JWT_SECRET: z.string().optional(),

  // AI — NVIDIA NIM (OpenAI-compatible)
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z
    .string()
    .default("https://integrate.api.nvidia.com/v1"),
  LLM_MODEL: z.string().default("deepseek-ai/deepseek-v3.1"),
  EMBED_MODEL: z.string().default("nvidia/nv-embedqa-e5-v5"),

  // Deprecated DeepSeek environment variables (kept for backward compatibility)
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().optional(),
  DEEPSEEK_MODEL: z.string().optional(),

  // Vault encryption
  ENCRYPTION_KEY: z.string().optional(), // 32-byte hex string for AES-256
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = JSON.stringify(result.error.flatten().fieldErrors, null, 2);
    throw new Error(
      `❌ Invalid environment variables:\n${formatted}`
    );
  }

  const data = result.data;
  // Fallback for transition: if NVIDIA_API_KEY is missing but DEEPSEEK_API_KEY exists
  if (!data.NVIDIA_API_KEY && data.DEEPSEEK_API_KEY) {
    data.NVIDIA_API_KEY = data.DEEPSEEK_API_KEY;
  }

  return data;
}

export const env = loadEnv();

