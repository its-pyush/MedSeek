import { z } from "zod";

export const createSessionSchema = z.object({});

export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(4000, "Message is too long (max 4000 characters)"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const sessionIdSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

export const listSessionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
