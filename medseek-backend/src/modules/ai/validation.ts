import { z } from "zod";

export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(4000, "Message is too long (max 4000 characters)"),
  /** The user's area as a half-degree grid corner, e.g. "19.0,72.5" (optional). */
  cell: z.string().max(20).optional(),
});

export const sessionIdSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

export const listSessionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
