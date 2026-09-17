// MedSeek Auth — Token management and authenticated API helpers.
// Tokens are stored in localStorage (client-side only).

import { API_BASE_URL } from "./config";

// ─── Types ───────────────────────────────────────────────────────

export interface Patient {
  id: number;
  email: string;
  created_at: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  data: {
    patient: Patient;
    tokens: AuthTokens;
  };
}

export interface PatientProfile {
  patient_id: number;
  email: string;
  age: number | null;
  sex: string | null;
  pregnancy_status: boolean | null;
  existing_conditions: string[];
  created_at: string;
}

// ─── Token Storage ───────────────────────────────────────────────

const ACCESS_TOKEN_KEY = "medseek_access_token";
const REFRESH_TOKEN_KEY = "medseek_refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens(tokens: AuthTokens): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null;
}

// ─── Authenticated Fetch ─────────────────────────────────────────

/**
 * Fetch wrapper that adds the Authorization header and handles
 * automatic token refresh on 401 responses.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = getAccessToken();

  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(url, { ...options, headers });

  // If 401, try refreshing the token once
  if (res.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          storeTokens(refreshData.data.tokens);

          // Retry the original request with the new token
          headers.set("Authorization", `Bearer ${refreshData.data.tokens.accessToken}`);
          res = await fetch(url, { ...options, headers });
        } else {
          // Refresh failed — clear tokens, user needs to re-login
          clearTokens();
        }
      } catch {
        clearTokens();
      }
    }
  }

  return res;
}

// ─── Auth API Functions ──────────────────────────────────────────

export async function signupApi(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Signup failed" } }));
    throw new Error(err.error?.message || `Signup failed with status ${res.status}`);
  }

  const data: AuthResponse = await res.json();
  storeTokens(data.data.tokens);
  return data;
}

export async function loginApi(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Login failed" } }));
    throw new Error(err.error?.message || `Login failed with status ${res.status}`);
  }

  const data: AuthResponse = await res.json();
  storeTokens(data.data.tokens);
  return data;
}

export function logout(): void {
  clearTokens();
}

// ─── Profile API ─────────────────────────────────────────────────

export async function getProfile(): Promise<PatientProfile> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Failed to load profile" } }));
    throw new Error(err.error?.message || "Failed to load profile");
  }

  const data = await res.json();
  return data.data;
}

export async function updateProfile(
  profileData: Partial<Pick<PatientProfile, "age" | "sex" | "pregnancy_status" | "existing_conditions">>
): Promise<PatientProfile> {
  const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile`, {
    method: "PUT",
    body: JSON.stringify(profileData),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Failed to update profile" } }));
    throw new Error(err.error?.message || "Failed to update profile");
  }

  const data = await res.json();
  return data.data;
}
