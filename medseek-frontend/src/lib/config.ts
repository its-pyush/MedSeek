// MedSeek Client Configuration
// Centrally manages API endpoints with resilient fallbacks for local and production environments.

export const API_BASE_URL: string = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://medseek-backend.onrender.com"
    : "http://localhost:4000")
).replace(/\/+$/, "");
