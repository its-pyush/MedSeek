import { z } from "zod";

// ─── Signup ──────────────────────────────────────────────────────

export const signupSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email must be at most 255 characters")
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

export type SignupInput = z.infer<typeof signupSchema>;

// ─── Login ───────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Refresh Token ───────────────────────────────────────────────

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

// ─── Profile Update ──────────────────────────────────────────────

export const profileUpdateSchema = z.object({
  age: z.number().int().min(0).max(150).nullable().optional(),
  sex: z
    .enum(["male", "female", "other"])
    .nullable()
    .optional(),
  pregnancy_status: z.boolean().nullable().optional(),
  existing_conditions: z
    .array(z.string().max(200))
    .max(50, "Too many conditions")
    .nullable()
    .optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
