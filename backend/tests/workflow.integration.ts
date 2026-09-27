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
const clientIds: string[] = [];
const projectIds: string[] = [];
const tokens: { admin: string; viewer: string; estimator: string } = {
  admin: "",
  viewer: "",
  estimator: "",
};
const input = {
  clientId: "",
  projectId: "",
  estimateDate: "2026-09-27",
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
  const createdClient = await admin
    .post("/api/clients")
    .set("Origin", config.ODAN_ORIGIN)
    .set("x-csrf-token", tokens.admin)
    .send({
      name: "Integration client",
      registrationNumber: "",
      vatNumber: "",
      address: "",
      contactPerson: "",
      telephone: "",
      email: "",
      notes: "",
    })
    .expect(201);
  clientIds.push(createdClient.body.id);
  input.clientId = createdClient.body.id;
  const createdProject = await admin
    .post(`/api/clients/${input.clientId}/projects`)
    .set("Origin", config.ODAN_ORIGIN)
    .set("x-csrf-token", tokens.admin)
    .send({
      projectCode: "",
      projectName: "Integration residence",
      siteAddress: "Test site",
      description: "",
      startDate: "",
      completionDate: "",
    })
    .expect(201);
  projectIds.push(createdProject.body.id);
  input.projectId = createdProject.body.id;
});
afterAll(async () => {
  await db.estimate.deleteMany({ where: { id: { in: estimateIds } } });
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.client.deleteMany({ where: { id: { in: clientIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});
describe("real PostgreSQL HTTP workflow", () => {
  const write = (
    agent: typeof admin,
    token: string,
    path: string,
    data: unknown,
  ) =>
    agent
      .post(path)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", token)
      .send(data);
  const clientBody = (name: string, code = "") => ({
    name,
    registrationNumber: code,
    vatNumber: "",
    address: "",
    contactPerson: "",
    telephone: "",
    email: "",
    notes: "",
  });
  const projectBody = (name: string, code = "") => ({
    projectCode: code,
    projectName: name,
    siteAddress: "",
    description: "",
    startDate: "",
    completionDate: "",
  });
  it("validates client identifiers, permissions and deactivation", async () => {
    await write(
      viewer,
      tokens.viewer,
      "/api/clients",
      clientBody("Blocked"),
    ).expect(403);
    await write(admin, tokens.admin, "/api/clients", clientBody("")).expect(
      400,
    );
    const code = `REG-${randomUUID()}`;
    const response = await write(
      estimator,
      tokens.estimator,
      "/api/clients",
      clientBody("Another client", code),
    ).expect(201);
    clientIds.push(response.body.id);
    expect(response.body.registrationNumber).toBe(code.toUpperCase());
    await write(
      admin,
      tokens.admin,
      "/api/clients",
      clientBody("Duplicate", code.toLowerCase()),
    ).expect(409);
    await viewer.get(`/api/clients/${response.body.id}`).expect(200);
    await viewer.get(`/api/clients/${response.body.id}/activity`).expect(403);
    const project = await write(
      admin,
      tokens.admin,
      `/api/clients/${response.body.id}/projects`,
      projectBody("Before deactivation"),
    ).expect(201);
    projectIds.push(project.body.id);
    await admin
      .patch(`/api/clients/${response.body.id}/status`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ active: false })
      .expect(200);
    await write(admin, tokens.admin, "/api/estimates", {
      ...input,
      clientId: response.body.id,
      projectId: project.body.id,
    }).expect(400);
    await write(
      admin,
      tokens.admin,
      `/api/clients/${response.body.id}/projects`,
      projectBody("Blocked project"),
    ).expect(409);
  });
  it("enforces project ownership and unique codes", async () => {
    const other = await write(
      admin,
      tokens.admin,
      "/api/clients",
      clientBody("Project owner"),
    ).expect(201);
    clientIds.push(other.body.id);
    const code = `PROJ-${randomUUID()}`;
    const project = await write(
      estimator,
      tokens.estimator,
      `/api/clients/${other.body.id}/projects`,
      projectBody("Owner project", code),
    ).expect(201);
    projectIds.push(project.body.id);
    await write(
      admin,
      tokens.admin,
      `/api/clients/${input.clientId}/projects`,
      projectBody("Duplicate", code.toLowerCase()),
    ).expect(409);
    await write(
      viewer,
      tokens.viewer,
      `/api/clients/${other.body.id}/projects`,
      projectBody("Viewer"),
    ).expect(403);
    await write(admin, tokens.admin, "/api/estimates", {
      ...input,
      projectId: project.body.id,
    }).expect(400);
    await admin
      .patch(`/api/projects/${project.body.id}/status`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ status: "ARCHIVED" })
      .expect(200);
    await write(admin, tokens.admin, "/api/estimates", {
      ...input,
      clientId: other.body.id,
      projectId: project.body.id,
    }).expect(400);
  });
  it("requires all estimate relationships and a valid date", async () => {
    await write(admin, tokens.admin, "/api/estimates", {
      ...input,
      clientId: undefined,
    }).expect(400);
    await write(admin, tokens.admin, "/api/estimates", {
      ...input,
      projectId: undefined,
    }).expect(400);
    await write(admin, tokens.admin, "/api/estimates", {
      ...input,
      estimateDate: undefined,
    }).expect(400);
  });
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
    expect(result.body.title).toBe("Integration residence");
    expect(result.body.clientName).toBe("Integration client");
  });
  it("shows dashboard counts, currency totals and snapshot fallback", async () => {
    const orderedIds: string[] = [];
    for (let index = 0; index < 12; index++) {
      const row = await db.estimate.create({
        data: {
          number: `IT-${randomUUID()}`,
          title: `Legacy project ${index}`,
          clientName: `Legacy client ${index}`,
          siteAddress: "Saved site",
          currency: index === 0 ? "USD" : "LKR",
          taxPercent: index === 0 ? 10 : 0,
          notes: "Temporary dashboard fixture",
          status: index === 0 ? "APPROVED" : "DRAFT",
          createdAt: new Date("2030-01-01T00:00:00.000Z"),
          items: {
            create: [
              {
                position: 0,
                description: "Work",
                unit: "m²",
                quantity: 2,
                rate: 100,
              },
            ],
          },
        },
      });
      estimateIds.push(row.id);
      orderedIds.push(row.id);
    }
    const result = await viewer.get("/api/dashboard").expect(200);
    expect(result.body.totalEstimates).toBeGreaterThanOrEqual(17);
    expect(result.body.activeClients).toBeGreaterThanOrEqual(2);
    expect(result.body.approvedTotalsByCurrency.LKR).toMatch(/^\d+\.\d{2}$/);
    expect(result.body.approvedTotalsByCurrency.USD).toBe("220.00");
    expect(result.body.recentEstimates.length).toBe(10);
    expect(
      result.body.recentEstimates.map((row: { id: string }) => row.id),
    ).toEqual(orderedIds.sort().reverse().slice(0, 10));
    expect(result.body.recentEstimates[0].clientName).toMatch(/^Legacy client/);
    expect(result.body.recentEstimates[0].projectTitle).toMatch(
      /^Legacy project/,
    );
    expect(result.body.recentEstimates[0].estimateDate).toBeNull();
    const clientPage = await viewer
      .get("/api/clients?sort=name&direction=asc&page=1&pageSize=20")
      .expect(200);
    expect(
      clientPage.body.data.every(
        (row: { totalsByCurrency: unknown }) => row.totalsByCurrency,
      ),
    ).toBe(true);
    expect(
      clientPage.body.data.find(
        (row: { id: string }) => row.id === input.clientId,
      ).totalsByCurrency.LKR,
    ).toBe("2950.00");
  });
  it("keeps snapshots until a draft relationship changes", async () => {
    const id = estimateIds[0];
    await admin
      .put(`/api/clients/${input.clientId}`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send(clientBody("Renamed client"))
      .expect(200);
    const unchanged = await admin.get(`/api/estimates/${id}`).expect(200);
    expect(unchanged.body.clientName).toBe("Integration client");
    const next = await write(
      admin,
      tokens.admin,
      `/api/clients/${input.clientId}/projects`,
      projectBody("New project"),
    ).expect(201);
    projectIds.push(next.body.id);
    const updated = await admin
      .put(`/api/estimates/${id}`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ ...input, projectId: next.body.id, version: 1 })
      .expect(200);
    expect(updated.body.title).toBe("New project");
    expect(updated.body.clientName).toBe("Renamed client");
    input.projectId = next.body.id;
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
        .send({ ...input, notes: "Update A", version: 2 }),
      admin
        .put(url)
        .set("Origin", config.ODAN_ORIGIN)
        .set("x-csrf-token", tokens.admin)
        .send({ ...input, notes: "Update B", version: 2 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (await db.estimate.findUniqueOrThrow({ where: { id: estimateIds[0] } }))
        .version,
    ).toBe(3);
    expect(
      await db.auditLog.count({
        where: { entityId: estimateIds[0], action: "ESTIMATE_UPDATED" },
      }),
    ).toBe(2);
  });
  it("enforces approval permissions and locks approved records", async () => {
    const url = `/api/estimates/${estimateIds[0]}`;
    await estimator
      .patch(`${url}/status`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.estimator)
      .send({ status: "SENT", version: 3 })
      .expect(200);
    await estimator
      .patch(`${url}/status`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.estimator)
      .send({ status: "APPROVED", version: 4 })
      .expect(403);
    await admin
      .patch(`${url}/status`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ status: "APPROVED", version: 4 })
      .expect(200);
    await admin
      .put(url)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ ...input, version: 5 })
      .expect(409);
  });
  it("preserves approved snapshots when Client and Project records change", async () => {
    const url = `/api/estimates/${estimateIds[0]}`;
    const before = await admin.get(url).expect(200);
    await admin
      .put(`/api/clients/${input.clientId}`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send(clientBody("Changed after approval"))
      .expect(200);
    await admin
      .put(`/api/projects/${input.projectId}`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({
        ...projectBody("Changed project after approval"),
        siteAddress: "Changed address",
      })
      .expect(200);
    const after = await admin.get(url).expect(200);
    expect({
      title: after.body.title,
      clientName: after.body.clientName,
      clientEmail: after.body.clientEmail,
      siteAddress: after.body.siteAddress,
      totals: after.body.totals,
      updatedAt: after.body.updatedAt,
    }).toEqual({
      title: before.body.title,
      clientName: before.body.clientName,
      clientEmail: before.body.clientEmail,
      siteAddress: before.body.siteAddress,
      totals: before.body.totals,
      updatedAt: before.body.updatedAt,
    });
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
