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

  // Auth (Phase 2)
  JWT_SECRET: z.string().optional(),

  // AI (Phase 3) — Deepseek uses OpenAI-compatible API
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),

  // Encryption (Phase 4)
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

  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;

