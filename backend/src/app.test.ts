import { beforeEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
vi.mock("./logger.js", async () => {
  const { default: pino } = await import("pino");
  return { logger: pino({ enabled: false }) };
});
vi.mock("./config.js", () => ({
  config: {
    NODE_ENV: "test",
    ODAN_ORIGIN: "http://127.0.0.1:43187",
    DATABASE_URL: "postgresql://test:test@localhost:5432/odan_estimation",
  },
}));
const repository = vi.hoisted(() => ({
  session: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  audit: vi.fn(),
  user: vi.fn(),
}));
vi.mock("./repositories/auth.repository.js", () => ({
  authRepository: repository,
}));
vi.mock("./repositories/estimate.repository.js", () => ({
  estimateRepository: { list: vi.fn(), get: vi.fn() },
}));
import { app } from "./app.js";
const token = "a".repeat(64);
const csrf = "b".repeat(64);
beforeEach(() => {
  vi.clearAllMocks();
  repository.session.mockResolvedValue(null);
});
describe("HTTP security boundaries", () => {
  it("serves health with secure headers", async () => {
    const result = await request(app).get("/api/health").expect(200);
    expect(result.headers["x-content-type-options"]).toBe("nosniff");
    expect(result.headers["x-powered-by"]).toBeUndefined();
  });
  it("requires authentication", async () => {
    await request(app).get("/api/estimates").expect(401);
  });
  it("blocks mutations without CSRF", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({ email: "a@example.com", password: "test" })
      .expect(403);
  });
  it("blocks a mismatching origin with otherwise valid CSRF", async () => {
    repository.session.mockResolvedValue({
      id: "id",
      csrfToken: csrf,
      expiresAt: new Date(Date.now() + 60000),
      user: null,
    });
    await request(app)
      .post("/api/auth/login")
      .set("Cookie", `odan_estimates_session=${token}`)
      .set("x-csrf-token", csrf)
      .set("Origin", "https://evil.example")
      .send({})
      .expect(403);
  });
  it("denies a viewer write access even with valid CSRF", async () => {
    repository.session.mockResolvedValue({
      id: "id",
      csrfToken: csrf,
      expiresAt: new Date(Date.now() + 60000),
      user: { id: "user", role: "VIEWER" },
    });
    await request(app)
      .post("/api/estimates")
      .set("Cookie", `odan_estimates_session=${token}`)
      .set("x-csrf-token", csrf)
      .set("Origin", "http://127.0.0.1:43187")
      .send({})
      .expect(403);
  });
  it("rejects expired sessions", async () => {
    repository.session.mockResolvedValue({
      id: "id",
      csrfToken: csrf,
      expiresAt: new Date(0),
      user: { id: "user", role: "ADMIN" },
    });
    await request(app)
      .get("/api/estimates")
      .set("Cookie", `odan_estimates_session=${token}`)
      .expect(401);
  });
  it("does not expose malformed JSON errors", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
    expect(response.body.message).toBe("Invalid JSON");
  });
});
