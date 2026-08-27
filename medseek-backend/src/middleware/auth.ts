import { Request, Response, NextFunction } from "express";

import { verifyAccessToken, AccessTokenPayload } from "../modules/auth/jwt.js";

// ─── Type Augmentation ──────────────────────────────────────────

/**
 * Extend Express Request to include authenticated user info.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
      };
    }
  }
}

// ─── Auth Middleware ──────────────────────────────────────────────

/**
 * Authenticate requests via JWT Bearer token.
 *
 * Extracts the token from the Authorization header, verifies it,
 * and attaches the decoded user payload to `req.user`.
 * Returns 401 if the token is missing, malformed, or invalid.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: { message: "Authentication required — missing or invalid Authorization header" },
    });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const decoded: AccessTokenPayload = verifyAccessToken(token);

    req.user = {
      id: decoded.sub,
      email: decoded.email,
    };

    next();
  } catch {
    res.status(401).json({
      error: { message: "Invalid or expired access token" },
    });
  }
}

// ─── Optional Auth ───────────────────────────────────────────────

/**
 * Optional authentication — attaches user if token is present and valid,
 * but doesn't reject the request if it's missing.
 * Useful for routes that work for both guests and authenticated users.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const decoded: AccessTokenPayload = verifyAccessToken(token);
      req.user = {
        id: decoded.sub,
        email: decoded.email,
      };
    } catch {
      // Token is invalid — continue without user (guest mode)
    }
  }

  next();
}

// ─── Role-Based Authorization ────────────────────────────────────

/**
 * Role-based authorization middleware.
 * For now, MedSeek only has "patient" role — this is a placeholder
 * for future roles like "admin" if needed.
 *
 * Must be used AFTER authenticate().
 */
export function authorize(..._roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: { message: "Authentication required" },
      });
      return;
    }

    // For V1, all authenticated users are patients with full access
    // to their own data. Role checking will be added if admin roles are introduced.
    next();
  };
}
