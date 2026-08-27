import { Router, Request, Response, NextFunction } from "express";

import { authenticate } from "../../middleware/auth.js";
import { badRequest } from "../../utils/AppError.js";
import { auditLogQuerySchema } from "./validation.js";
import { getAccessLog, getDistinctActions } from "./service.js";

const router = Router();

// All audit routes require authentication
router.use(authenticate);

// ─── GET /api/audit/log ──────────────────────────────────────────
// Get patient's own access/activity log.

router.get(
  "/log",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = auditLogQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues.map((i) => i.message).join("; "));
      }

      const { action, start_date, end_date, limit, offset } = parsed.data;
      const result = await getAccessLog(req.user!.id, {
        action,
        startDate: start_date,
        endDate: end_date,
        limit,
        offset,
      });

      res.json({
        data: result.entries,
        meta: { total: result.total, limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/audit/actions ──────────────────────────────────────
// Get distinct action types for filter dropdown.

router.get(
  "/actions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actions = await getDistinctActions(req.user!.id);
      res.json({ data: actions });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
