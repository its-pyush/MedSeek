/**
 * Custom application error class.
 *
 * Carries a statusCode and isOperational flag so the global error handler
 * can distinguish expected errors (bad input, not found) from unexpected ones.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Factory functions ───────────────────────────────────────────

export function notFound(message = "Resource not found"): AppError {
  return new AppError(message, 404);
}

export function badRequest(message = "Bad request"): AppError {
  return new AppError(message, 400);
}

export function internal(message = "Internal server error"): AppError {
  return new AppError(message, 500, false);
}
