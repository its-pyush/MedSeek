import { z } from "zod";

// ─── Search query parameters ─────────────────────────────────────

export const searchQuerySchema = z.object({
  symptoms: z
    .string({ required_error: "symptoms parameter is required" })
    .min(1, "symptoms parameter cannot be empty")
    .transform((val) =>
      val
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
    )
    .pipe(z.array(z.string()).min(1, "At least one symptom is required")),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),

  // Phase 6 — demographic filters (optional)
  age: z.coerce.number().int().min(0).max(150).optional(),
  sex: z.enum(["male", "female", "other"]).optional(),
  pregnant: z.coerce.boolean().optional(),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

// ─── Disease detail parameters ───────────────────────────────────

export const diseaseIdSchema = z.object({
  id: z.coerce.number().int().positive("Disease ID must be a positive integer"),
});

export type DiseaseIdParams = z.infer<typeof diseaseIdSchema>;

// ─── Autocomplete query parameters ──────────────────────────────

export const autocompleteQuerySchema = z.object({
  q: z
    .string({ required_error: "q parameter is required" })
    .min(1, "Query must be at least 1 character"),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export type AutocompleteQuery = z.infer<typeof autocompleteQuerySchema>;
