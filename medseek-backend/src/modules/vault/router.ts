import { Router, Request, Response, NextFunction } from "express";

import { authenticate } from "../../middleware/auth.js";
import { badRequest } from "../../utils/AppError.js";
import {
  createRecordSchema,
  updateRecordSchema,
  recordIdSchema,
  listRecordsSchema,
} from "./validation.js";
import {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
} from "./service.js";

const router = Router();

// All vault routes require authentication
router.use(authenticate);

// ─── GET /api/vault/records ──────────────────────────────────────
// List patient's health records (metadata only).

router.get(
  "/records",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listRecordsSchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues.map((i) => i.message).join("; "));
      }

      const { type, limit, offset } = parsed.data;
      const result = await listRecords(req.user!.id, type, limit, offset);

      res.json({
        data: result.records,
        meta: { total: result.total, limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/vault/records/:id ──────────────────────────────────
// Get a specific record with decrypted data.

router.get(
  "/records/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = recordIdSchema.safeParse(req.params);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues.map((i) => i.message).join("; "));
      }

      const record = await getRecord(parsed.data.id, req.user!.id);
      res.json({ data: record });
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /api/vault/records ─────────────────────────────────────
// Create a new encrypted health record.

router.post(
  "/records",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createRecordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues.map((i) => i.message).join("; "));
      }

      const record = await createRecord(
        req.user!.id,
        parsed.data.record_type,
        parsed.data.data as Record<string, unknown>
      );

      res.status(201).json({ data: record });
    } catch (error) {
      next(error);
    }
  }
);

// ─── PUT /api/vault/records/:id ──────────────────────────────────
// Update an existing record (re-encrypts).

router.put(
  "/records/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsParsed = recordIdSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        throw badRequest(paramsParsed.error.issues.map((i) => i.message).join("; "));
      }

      const bodyParsed = updateRecordSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw badRequest(bodyParsed.error.issues.map((i) => i.message).join("; "));
      }

      const record = await updateRecord(
        paramsParsed.data.id,
        req.user!.id,
        bodyParsed.data.data as Record<string, unknown>
      );

      res.json({ data: record });
    } catch (error) {
      next(error);
    }
  }
);

// ─── DELETE /api/vault/records/:id ───────────────────────────────
// Delete a health record.

router.delete(
  "/records/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = recordIdSchema.safeParse(req.params);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues.map((i) => i.message).join("; "));
      }

      await deleteRecord(parsed.data.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
