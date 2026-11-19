import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/auth.js";
import { badRequest } from "../../utils/AppError.js";
import { parseCell } from "./geo.js";
import { recordCase } from "./service.js";

const router = Router();

const reportSchema = z.object({
  disease_id: z.coerce.number().int().positive("disease_id must be a positive integer"),
  cell: z.string({ required_error: "cell is required" }),
});

// ─── POST /api/cases ─────────────────────────────────────────────
// "A doctor diagnosed me with this." Login required; one count per person,
// condition and month. Body: { disease_id, cell: "19.0,72.5" }

router.post("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((i) => i.message).join("; "));
    }
    const cell = parseCell(parsed.data.cell);
    if (!cell) throw badRequest("cell must be an area corner such as 19.0,72.5 (half-degree steps)");

    const result = await recordCase(req.user!.id, parsed.data.disease_id, cell);
    res.status(result.counted ? 201 : 200).json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
