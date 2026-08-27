/**
 * Audit logging middleware.
 *
 * Automatically logs authenticated API access to the access_log table.
 * Runs after authentication, captures the action and result.
 */

import { Request, Response, NextFunction } from "express";
import { logAccess } from "../modules/audit/service.js";

/**
 * Map HTTP method + path to a human-readable action name.
 */
function resolveAction(method: string, path: string): string {
  // Normalize: remove trailing slashes, lowercase
  const normalizedPath = path.replace(/\/+$/, "").toLowerCase();

  // Extract the module from the path (e.g., /api/search → search)
  const pathParts = normalizedPath.split("/").filter(Boolean);
  const module = pathParts[1] ?? "unknown"; // [api, module, ...]
  const subResource = pathParts[2] ?? "";

  const actionMap: Record<string, Record<string, string>> = {
    search: {
      GET: "search.query",
    },
    auth: {
      POST: subResource === "signup" ? "auth.signup"
           : subResource === "login" ? "auth.login"
           : subResource === "refresh" ? "auth.refresh"
           : "auth.unknown",
      GET: subResource === "profile" ? "profile.view" : "auth.me",
      PUT: "profile.update",
    },
    ai: {
      POST: "chat.message",
      GET: "chat.view",
    },
    vault: {
      GET: "vault.read",
      POST: "vault.create",
      PUT: "vault.update",
      DELETE: "vault.delete",
    },
    audit: {
      GET: "audit.view",
    },
  };

  return actionMap[module]?.[method] ?? `${module}.${method.toLowerCase()}`;
}

/**
 * Extract the target table and ID from the request path if possible.
 */
function resolveTarget(path: string): { table: string | undefined; id: number | undefined } {
  const parts = path.split("/").filter(Boolean);
  // Look for patterns like /api/vault/records/123
  const resourceIdx = parts.findIndex((p) => ["records", "sessions", "diseases"].includes(p));
  if (resourceIdx >= 0) {
    const table = parts[resourceIdx];
    const idStr = parts[resourceIdx + 1];
    const id = idStr ? parseInt(idStr, 10) : undefined;
    return { table, id: Number.isFinite(id) ? id : undefined };
  }
  return { table: undefined, id: undefined };
}

/**
 * Audit logger middleware. Must be placed AFTER authenticate middleware.
 * Only logs requests from authenticated users.
 */
export function auditLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Only audit authenticated requests
  if (!req.user) {
    next();
    return;
  }

  const patientId = req.user.id;
  const action = resolveAction(req.method, req.originalUrl);
  const { table, id } = resolveTarget(req.originalUrl);

  // Log after response is sent (don't block the request)
  res.on("finish", () => {
    const success = res.statusCode < 400;
    logAccess(patientId, action, table, id, success).catch((err) => {
      console.error("Failed to write audit log:", err);
    });
  });

  next();
}
