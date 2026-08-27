import { Request, Response, NextFunction } from "express";

/**
 * Request logger middleware.
 * Logs method, URL, status code, and response time for every request.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logLine = `${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`;

    if (res.statusCode >= 500) {
      console.error(`❌ ${logLine}`);
    } else if (res.statusCode >= 400) {
      console.warn(`⚠️  ${logLine}`);
    } else {
      console.log(`✅ ${logLine}`);
    }
  });

  next();
}
