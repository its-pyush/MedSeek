import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

const app = createApp();

describe("Health check", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("uptime");
  });
});

describe("404 handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body.error).toHaveProperty("message");
  });
});

describe("API routes", () => {
  it("GET /api/search without symptoms returns 400", async () => {
    const res = await request(app).get("/api/search");
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty("message");
  });

  it("GET /api/ai without auth returns 401", async () => {
    const res = await request(app).get("/api/ai/sessions");
    expect(res.status).toBe(401);
  });

  it("GET /api/vault without auth returns 401", async () => {
    const res = await request(app).get("/api/vault/records");
    expect(res.status).toBe(401);
  });

  it("GET /api/audit without auth returns 401", async () => {
    const res = await request(app).get("/api/audit/log");
    expect(res.status).toBe(401);
  });
});
