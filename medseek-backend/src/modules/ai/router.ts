import { Router, Request, Response, NextFunction } from "express";

import { authenticate } from "../../middleware/auth.js";
import { badRequest } from "../../utils/AppError.js";
import {
  sendMessageSchema,
  sessionIdSchema,
  listSessionsSchema,
} from "./validation.js";
import {
  createSession,
  listSessions,
  getSessionWithMessages,
  sendMessage,
} from "./service.js";

const router = Router();

// All AI chat routes require authentication
router.use(authenticate);

// ─── POST /api/ai/sessions ──────────────────────────────────────
// Create a new chat session.

router.post(
  "/sessions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await createSession(req.user!.id);
      res.status(201).json({ data: session });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/ai/sessions ───────────────────────────────────────
// List patient's chat sessions.

router.get(
  "/sessions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listSessionsSchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues.map((i) => i.message).join("; "));
      }

      const { limit, offset } = parsed.data;
      const result = await listSessions(req.user!.id, limit, offset);

      res.json({
        data: result.sessions,
        meta: { total: result.total, limit, offset },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/ai/sessions/:sessionId ────────────────────────────
// Get a chat session with full message history.

router.get(
  "/sessions/:sessionId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = sessionIdSchema.safeParse(req.params);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues.map((i) => i.message).join("; "));
      }

      const result = await getSessionWithMessages(
        parsed.data.sessionId,
        req.user!.id
      );

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /api/ai/sessions/:sessionId/messages ──────────────────
// Send a message in a chat session and get an AI response.

router.post(
  "/sessions/:sessionId/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsParsed = sessionIdSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        throw badRequest(
          paramsParsed.error.issues.map((i) => i.message).join("; ")
        );
      }

      const bodyParsed = sendMessageSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw badRequest(
          bodyParsed.error.issues.map((i) => i.message).join("; ")
        );
      }

      const response = await sendMessage(
        paramsParsed.data.sessionId,
        req.user!.id,
        bodyParsed.data.content
      );

      res.json({ data: response });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
