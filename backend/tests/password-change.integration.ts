import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("../src/logger.js", async () => {
  const { default: pino } = await import("pino");
  return { logger: pino({ enabled: false }) };
});
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { db } from "../src/db.js";
import { authRepository } from "../src/repositories/auth.repository.js";
import { hashPassword } from "../src/services/auth.service.js";

const primary = request.agent(app);
const other = request.agent(app);
const originalPassword = randomUUID() + randomUUID();
const replacementPassword = randomUUID() + randomUUID();
let userId = "";
let email = "";
let primaryCsrf = "";

async function signIn(
  agent: ReturnType<typeof request.agent>,
  password: string,
) {
  const anonymous = await agent.get("/api/auth/session").expect(200);
  return agent
    .post("/api/auth/login")
    .set("Origin", config.ODAN_ORIGIN)
    .set("x-csrf-token", anonymous.body.csrfToken)
    .send({ email, password })
    .expect(200);
}

beforeAll(async () => {
  email = `password-test-${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: {
      email,
      name: "Password integration test",
      role: "ADMIN",
      passwordHash: await argon2.hash(originalPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
    },
  });
  userId = user.id;
  primaryCsrf = (await signIn(primary, originalPassword)).body.csrfToken;
  await signIn(other, originalPassword);
});

afterAll(async () => {
  if (userId) {
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    await db.user.delete({ where: { id: userId } });
  }
  await db.$disconnect();
});

describe("password change", () => {
  const endpoint = "/api/auth/change-password";
  const post = (currentPassword: string, newPassword: string) =>
    primary
      .post(endpoint)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", primaryCsrf)
      .send({ currentPassword, newPassword });

  it("requires authentication and CSRF", async () => {
    await request(app).post(endpoint).send({}).expect(403);
    await primary
      .post(endpoint)
      .set("Origin", config.ODAN_ORIGIN)
      .send({})
      .expect(403);
  });

  it("rejects wrong current, short, and reused passwords without changing state", async () => {
    const before = (await db.user.findUniqueOrThrow({ where: { id: userId } }))
      .passwordHash;
    await post("not-the-current-password", replacementPassword).expect(401);
    await post(originalPassword, "short").expect(400);
    await post(originalPassword, originalPassword).expect(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash,
    ).toBe(before);
    expect(
      await db.auditLog.count({
        where: { actorId: userId, action: "AUTH_PASSWORD_CHANGED" },
      }),
    ).toBe(0);
  });

  it("updates the hash, preserves only the current session, and audits safely", async () => {
    const before = (await db.user.findUniqueOrThrow({ where: { id: userId } }))
      .passwordHash;
    await post(originalPassword, replacementPassword).expect(204);
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.passwordHash).not.toBe(before);
    expect(await argon2.verify(after.passwordHash, replacementPassword)).toBe(
      true,
    );
    expect(await db.session.count({ where: { userId } })).toBe(1);
    await primary.get("/api/estimates").expect(200);
    await other.get("/api/estimates").expect(401);
    const events = await db.auditLog.findMany({
      where: { actorId: userId, action: "AUTH_PASSWORD_CHANGED" },
    });
    expect(events).toHaveLength(1);
    expect(events[0].entityId).toBeNull();
    expect(JSON.stringify(events[0])).not.toContain(originalPassword);
    expect(JSON.stringify(events[0])).not.toContain(replacementPassword);
    expect(JSON.stringify(events[0])).not.toContain(after.passwordHash);
    const fresh = request.agent(app);
    const anonymous = await fresh.get("/api/auth/session").expect(200);
    await fresh
      .post("/api/auth/login")
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", anonymous.body.csrfToken)
      .send({ email, password: originalPassword })
      .expect(401);
    await fresh
      .post("/api/auth/login")
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", anonymous.body.csrfToken)
      .send({ email, password: replacementPassword })
      .expect(200);
  });

  it("revokes every session for an existing account during recovery", async () => {
    const user = await authRepository.user(email);
    expect(user?.role).toBe("ADMIN");
    const recoveredPassword = randomUUID() + randomUUID();
    expect(
      await authRepository.replacePassword({
        userId: user!.id,
        expectedHash: user!.passwordHash,
        newHash: await hashPassword(recoveredPassword),
        action: "AUTH_PASSWORD_RECOVERED",
      }),
    ).toBe(true);
    expect(await db.session.count({ where: { userId } })).toBe(0);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).role,
    ).toBe("ADMIN");
    expect(
      await db.auditLog.count({
        where: { actorId: userId, action: "AUTH_PASSWORD_RECOVERED" },
      }),
    ).toBe(1);
    await primary.get("/api/estimates").expect(401);
  });
});
