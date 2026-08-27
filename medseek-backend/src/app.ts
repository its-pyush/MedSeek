import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { auditLogger } from "./middleware/auditLogger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { optionalAuth } from "./middleware/auth.js";
import searchRouter from "./modules/search/router.js";
import aiRouter from "./modules/ai/router.js";
import vaultRouter from "./modules/vault/router.js";
import authRouter from "./modules/auth/router.js";
import auditRouter from "./modules/audit/router.js";

export function createApp() {
  const app = express();

  // --------------- Global middleware ---------------

  // Security headers
  app.use(helmet());

  // CORS — allow frontend origin
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting — general protection
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: env.NODE_ENV === "production" ? 100 : 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { message: "Too many requests, please try again later" } },
    })
  );

  // Request logging
  app.use(requestLogger);

  // Optional auth — attach user if token present (for audit logging)
  app.use(optionalAuth);

  // Audit logging — logs authenticated API access
  app.use(auditLogger);

  // --------------- Health check ---------------

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // --------------- API routes ---------------

  app.use("/api/search", searchRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/vault", vaultRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/audit", auditRouter);

  // --------------- Error handling ---------------

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
