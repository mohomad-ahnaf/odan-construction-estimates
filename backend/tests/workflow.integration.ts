import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("../src/logger.js", async () => {
  const { default: pino } = await import("pino");
  return { logger: pino({ enabled: false }) };
});
import request from "supertest";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { config } from "../src/config.js";
const admin = request.agent(app);
const viewer = request.agent(app);
const estimator = request.agent(app);
const userIds: string[] = [];
const estimateIds: string[] = [];
const tokens: { admin: string; viewer: string; estimator: string } = {
  admin: "",
  viewer: "",
  estimator: "",
};
const input = {
  title: "Integration residence",
  clientName: "Integration client",
  clientEmail: "",
  siteAddress: "Test site",
  currency: "LKR",
  taxPercent: 18,
  notes: "Integration record",
  items: [{ description: "Concrete", unit: "m³", quantity: 2.5, rate: 1000 }],
};
beforeAll(async () => {
  const password = randomUUID() + randomUUID();
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  for (const [name, agent, role] of [
    ["admin", admin, "ADMIN"],
    ["viewer", viewer, "VIEWER"],
    ["estimator", estimator, "ESTIMATOR"],
  ] as const) {
    const user = await db.user.create({
      data: {
        email: `integration-${randomUUID()}@example.com`,
        name: "Integration test",
        role,
        passwordHash,
      },
    });
    userIds.push(user.id);
    const session = await agent.get("/api/auth/session").expect(200);
    const login = await agent
      .post("/api/auth/login")
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", session.body.csrfToken)
      .send({ email: user.email, password })
      .expect(200);
    expect(login.body.csrfToken).not.toBe(session.body.csrfToken);
    expect(login.headers["set-cookie"][0]).toContain("HttpOnly");
    tokens[name] = login.body.csrfToken;
  }
});
afterAll(async () => {
  await db.estimate.deleteMany({ where: { id: { in: estimateIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});
describe("real PostgreSQL HTTP workflow", () => {
  it("persists a draft and its audit record atomically", async () => {
    const result = await admin
      .post("/api/estimates")
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send(input)
      .expect(201);
    estimateIds.push(result.body.id);
    expect(result.body.totals.total).toBe("2950.00");
    expect(
      await db.auditLog.count({
        where: { entityId: result.body.id, action: "ESTIMATE_CREATED" },
      }),
    ).toBe(1);
    await admin.get(`/api/estimates/${result.body.id}`).expect(200);
  });
  it("rejects a viewer mutation and audit access", async () => {
    await viewer
      .post("/api/estimates")
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.viewer)
      .send(input)
      .expect(403);
    await viewer.get("/api/audit").expect(403);
    await viewer.get("/api/estimates").expect(200);
  });
  it("allows exactly one concurrent update and rejects stale versions", async () => {
    const url = `/api/estimates/${estimateIds[0]}`;
    const results = await Promise.all([
      admin
        .put(url)
        .set("Origin", config.ODAN_ORIGIN)
        .set("x-csrf-token", tokens.admin)
        .send({ ...input, title: "Update A", version: 1 }),
      admin
        .put(url)
        .set("Origin", config.ODAN_ORIGIN)
        .set("x-csrf-token", tokens.admin)
        .send({ ...input, title: "Update B", version: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (await db.estimate.findUniqueOrThrow({ where: { id: estimateIds[0] } }))
        .version,
    ).toBe(2);
    expect(
      await db.auditLog.count({
        where: { entityId: estimateIds[0], action: "ESTIMATE_UPDATED" },
      }),
    ).toBe(1);
  });
  it("enforces approval permissions and locks approved records", async () => {
    const url = `/api/estimates/${estimateIds[0]}`;
    await estimator
      .patch(`${url}/status`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.estimator)
      .send({ status: "SENT", version: 2 })
      .expect(200);
    await estimator
      .patch(`${url}/status`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.estimator)
      .send({ status: "APPROVED", version: 3 })
      .expect(403);
    await admin
      .patch(`${url}/status`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ status: "APPROVED", version: 3 })
      .expect(200);
    await admin
      .put(url)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ ...input, version: 4 })
      .expect(409);
  });
  it("exports a real xlsx workbook to an authenticated viewer", async () => {
    const response = await viewer
      .get(`/api/estimates/${estimateIds[0]}/export/xlsx`)
      .expect(200);
    expect(response.headers["content-type"]).toContain("spreadsheetml");
    expect(response.headers["content-disposition"]).toContain(".xlsx");
  });
  it("revokes server-side sessions on logout", async () => {
    await viewer
      .post("/api/auth/logout")
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.viewer)
      .expect(204);
    await viewer.get("/api/estimates").expect(401);
  });
});
