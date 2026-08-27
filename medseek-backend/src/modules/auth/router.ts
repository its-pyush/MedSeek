import { Router, Request, Response, NextFunction } from "express";

import { authenticate } from "../../middleware/auth.js";
import { badRequest } from "../../utils/AppError.js";
import {
  signupSchema,
  loginSchema,
  refreshSchema,
  profileUpdateSchema,
} from "./validation.js";
import { signup, login, refresh, getPatientById } from "./service.js";
import { getPatientProfile, updatePatientProfile } from "./profile.service.js";

const router = Router();

// ─── POST /api/auth/signup ───────────────────────────────────────
// Create a new patient account.

router.post(
  "/signup",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest(
          parsed.error.issues.map((i) => i.message).join("; ")
        );
      }

      const { email, password } = parsed.data;
      const result = await signup(email, password);

      res.status(201).json({
        data: {
          patient: result.patient,
          tokens: result.tokens,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /api/auth/login ────────────────────────────────────────
// Authenticate with email and password.

router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest(
          parsed.error.issues.map((i) => i.message).join("; ")
        );
      }

      const { email, password } = parsed.data;
      const result = await login(email, password);

      res.json({
        data: {
          patient: result.patient,
          tokens: result.tokens,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /api/auth/refresh ──────────────────────────────────────
// Exchange a refresh token for a new token pair.

router.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest(
          parsed.error.issues.map((i) => i.message).join("; ")
        );
      }

      const tokens = await refresh(parsed.data.refreshToken);

      res.json({
        data: { tokens },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/auth/me ────────────────────────────────────────────
// Get current authenticated patient's account info.

router.get(
  "/me",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const patient = await getPatientById(req.user!.id);
      res.json({ data: patient });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/auth/profile ───────────────────────────────────────
// Get current patient's full profile (account + extended data).

router.get(
  "/profile",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await getPatientProfile(req.user!.id);
      res.json({ data: profile });
    } catch (error) {
      next(error);
    }
  }
);

// ─── PUT /api/auth/profile ───────────────────────────────────────
// Update current patient's profile fields.

router.put(
  "/profile",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = profileUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest(
          parsed.error.issues.map((i) => i.message).join("; ")
        );
      }

      const profile = await updatePatientProfile(req.user!.id, parsed.data);
      res.json({ data: profile });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
