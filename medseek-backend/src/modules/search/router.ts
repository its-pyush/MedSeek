import { Router, Request, Response, NextFunction } from "express";

import {
  searchQuerySchema,
  diseaseIdSchema,
  autocompleteQuerySchema,
} from "./validation.js";
import {
  searchDiseases,
  getDiseaseById,
  autocompleteSymptoms,
} from "./service.js";
import { badRequest } from "../../utils/AppError.js";

const router = Router();

// ─── GET /api/search ─────────────────────────────────────────────
// Multi-symptom disease search with ranking.
// Query params: symptoms (comma-separated), limit, offset
//
// Example: GET /api/search?symptoms=fever,headache&limit=10&offset=0

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest(
        parsed.error.issues.map((i) => i.message).join("; ")
      );
    }

    const { symptoms, limit, offset } = parsed.data;
    const result = await searchDiseases(symptoms, limit, offset);

    res.json({
      data: result.results,
      dont_rule_out: result.dont_rule_out,
      meta: {
        total: result.total,
        limit,
        offset,
        resolved_symptoms: result.resolved_symptoms,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── GET /api/search/diseases/:id ────────────────────────────────
// Disease detail page — full record with all associated symptoms.

router.get(
  "/diseases/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = diseaseIdSchema.safeParse(req.params);
      if (!parsed.success) {
        throw badRequest(
          parsed.error.issues.map((i) => i.message).join("; ")
        );
      }

      const disease = await getDiseaseById(parsed.data.id);
      res.json({ data: disease });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/search/symptoms/autocomplete ───────────────────────
// Symptom autocomplete — fuzzy matches against canonical names + synonyms.
// Query params: q (search string), limit

router.get(
  "/symptoms/autocomplete",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = autocompleteQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest(
          parsed.error.issues.map((i) => i.message).join("; ")
        );
      }

      const { q, limit } = parsed.data;
      const results = await autocompleteSymptoms(q, limit);
      res.json({ data: results });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

