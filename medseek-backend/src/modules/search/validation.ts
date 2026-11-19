import { z } from "zod";

import { parseCell } from "../cases/geo.js";

// ─── Search query parameters ─────────────────────────────────────

export const searchQuerySchema = z.object({
  symptoms: z
    .string({ required_error: "symptoms parameter is required" })
    .min(1, "symptoms parameter cannot be empty")
    .transform((val) =>
      val
        .split(",")
        // "_" → space so ids such as "chest_pain" resolve like typed text
        .map((s) => s.replace(/_+/g, " ").replace(/\s+/g, " ").trim().toLowerCase())
        .filter((s) => s.length > 0)
    )
    .pipe(z.array(z.string()).min(1, "At least one symptom is required")),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),

  // Demographic filters (optional)
  age: z.coerce.number().int().min(0).max(150).optional(),
  sex: z.enum(["male", "female", "other"]).optional(),
  pregnant: z.coerce.boolean().optional(),

  // The user's area as a half-degree grid corner, e.g. "19.0,72.5" (optional)
  cell: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === "") return undefined;
      const cell = parseCell(value);
      if (!cell) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cell must be an area corner such as 19.0,72.5" });
        return z.NEVER;
      }
      return cell;
    }),
});

// ─── Disease detail parameters ───────────────────────────────────

export const diseaseIdSchema = z.object({
  id: z.coerce.number().int().positive("Disease ID must be a positive integer"),
});

// ─── Autocomplete query parameters ──────────────────────────────

export const autocompleteQuerySchema = z.object({
  q: z
    .string({ required_error: "q parameter is required" })
    .min(1, "Query must be at least 1 character"),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
