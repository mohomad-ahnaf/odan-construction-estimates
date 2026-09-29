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
  description: "Integration estimate",
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
      projectName: "Integration residence",
      siteAddress: "Test site",
      description: "",
      startDate: "",
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
  const clientBody = (name: string) => ({
    name,
    address: "",
    contactPerson: "",
    telephone: "",
    email: "",
    notes: "",
  });
  const projectBody = (name: string) => ({
    projectName: name,
    siteAddress: "",
    description: "",
    startDate: "",
  });
  it("validates generated Client Numbers, permissions and deactivation", async () => {
    await write(
      viewer,
      tokens.viewer,
      "/api/clients",
      clientBody("Blocked"),
    ).expect(403);
    await write(admin, tokens.admin, "/api/clients", clientBody("")).expect(
      400,
    );
    const response = await write(
      estimator,
      tokens.estimator,
      "/api/clients",
      clientBody("Another client"),
    ).expect(201);
    clientIds.push(response.body.id);
    expect(response.body.clientCode).toMatch(/^ODN-CLI-\d{4,}$/);
    expect(response.body).not.toHaveProperty("registrationNumber");
    expect(response.body).not.toHaveProperty("vatNumber");
    await write(admin, tokens.admin, "/api/clients", {
      ...clientBody("Manual client code"),
      clientCode: "CUSTOM",
    }).expect(400);
    await admin
      .put(`/api/clients/${response.body.id}`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ ...clientBody("Changed"), clientCode: "CUSTOM" })
      .expect(400);
    await write(admin, tokens.admin, "/api/clients", {
      ...clientBody("Old registration"),
      registrationNumber: "LEGACY",
    }).expect(400);
    await write(admin, tokens.admin, "/api/clients", {
      ...clientBody("Old VAT"),
      vatNumber: "LEGACY",
    }).expect(400);
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
      `/api/projects/${project.body.id}/estimates`,
      {
        description: input.description,
        estimateDate: input.estimateDate,
        currency: input.currency,
        taxPercent: input.taxPercent,
        notes: input.notes,
        items: input.items,
      },
    ).expect(400);
    await write(
      admin,
      tokens.admin,
      `/api/clients/${response.body.id}/projects`,
      projectBody("Blocked project"),
    ).expect(409);
  });
  it("enforces project ownership and backend-generated immutable codes", async () => {
    const other = await write(
      admin,
      tokens.admin,
      "/api/clients",
      clientBody("Project owner"),
    ).expect(201);
    clientIds.push(other.body.id);
    const project = await write(
      estimator,
      tokens.estimator,
      `/api/clients/${other.body.id}/projects`,
      projectBody("Owner project"),
    ).expect(201);
    projectIds.push(project.body.id);
    expect(project.body.projectCode).toMatch(/^ODN-PRJ-\d{4,}$/);
    await write(
      admin,
      tokens.admin,
      `/api/clients/${input.clientId}/projects`,
      { ...projectBody("Manual code"), projectCode: project.body.projectCode },
    ).expect(400);
    await write(
      admin,
      tokens.admin,
      `/api/clients/${input.clientId}/projects`,
      { ...projectBody("Old completion field"), completionDate: "2026-12-31" },
    ).expect(400);
    await admin
      .put(`/api/projects/${project.body.id}`)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ ...projectBody("Changed"), projectCode: "CUSTOM" })
      .expect(400);
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
    await write(
      admin,
      tokens.admin,
      `/api/projects/${project.body.id}/estimates`,
      {
        description: input.description,
        estimateDate: input.estimateDate,
        currency: input.currency,
        taxPercent: input.taxPercent,
        notes: input.notes,
        items: input.items,
      },
    ).expect(400);
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
  it("creates and lists estimates under one Project with immutable code snapshots", async () => {
    const payload = {
      description: input.description,
      estimateDate: input.estimateDate,
      currency: input.currency,
      taxPercent: input.taxPercent,
      notes: input.notes,
      items: input.items,
    };
    await write(
      viewer,
      tokens.viewer,
      `/api/projects/${input.projectId}/estimates`,
      payload,
    ).expect(403);
    await write(
      admin,
      tokens.admin,
      `/api/projects/${input.projectId}/estimates`,
      { ...payload, clientId: input.clientId },
    ).expect(400);
    const created = await write(
      admin,
      tokens.admin,
      `/api/projects/${input.projectId}/estimates`,
      payload,
    ).expect(201);
    expect(created.body.clientId).toBe(input.clientId);
    expect(created.body.projectId).toBe(input.projectId);
    const [client, project] = await Promise.all([
      db.client.findUniqueOrThrow({ where: { id: input.clientId } }),
      db.project.findUniqueOrThrow({ where: { id: input.projectId } }),
    ]);
    expect(created.body.clientNumber).toBe(client.clientCode);
    expect(created.body).not.toHaveProperty("clientRegistrationNumberSnapshot");
    expect(created.body).not.toHaveProperty("clientVatNumberSnapshot");
    expect(created.body.projectCodeSnapshot).toBe(project.projectCode);
    const listing = await viewer
      .get(`/api/projects/${input.projectId}/estimates`)
      .expect(200);
    expect(
      listing.body.data.some(
        (row: { id: string }) => row.id === created.body.id,
      ),
    ).toBe(true);
    const draftOnly = await viewer
      .get(
        `/api/projects/${input.projectId}/estimates?search=${created.body.number}&status=DRAFT`,
      )
      .expect(200);
    expect(draftOnly.body.data.map((row: { id: string }) => row.id)).toContain(
      created.body.id,
    );
    const approvedOnly = await viewer
      .get(`/api/projects/${input.projectId}/estimates?status=APPROVED`)
      .expect(200);
    expect(
      approvedOnly.body.data.map((row: { id: string }) => row.id),
    ).not.toContain(created.body.id);
    await viewer.get(`/api/projects/${randomUUID()}/estimates`).expect(404);
    await db.estimate.delete({ where: { id: created.body.id } });
  });
  it("copies project estimate items independently and audits both IDs", async () => {
    const path = `/api/projects/${input.projectId}/estimates`;
    const sourcePayload = {
      description: "Original scope",
      estimateDate: input.estimateDate,
      currency: "LKR",
      markupPercent: 0,
      taxPercent: 0,
      notes: "",
      items: [
        { description: "Concrete", unit: "m³", quantity: 2, rate: 100 },
        { description: "Steel", unit: "kg", quantity: 3, rate: 50 },
      ],
    };
    const source = await write(admin, tokens.admin, path, sourcePayload).expect(201);
    estimateIds.push(source.body.id);
    const copiedItems = source.body.items.map(
      ({ description, unit, quantity, rate }: {
        description: string; unit: string; quantity: number; rate: number;
      }) => ({ description, unit, quantity, rate }),
    );
    const copyPayload = {
      ...sourcePayload,
      description: "New independent scope",
      markupPercent: 10,
      taxPercent: 5,
      items: copiedItems,
      copiedFromEstimateId: source.body.id,
    };
    await write(viewer, tokens.viewer, path, copyPayload).expect(403);
    const otherProject = await write(
      admin,
      tokens.admin,
      `/api/clients/${input.clientId}/projects`,
      projectBody("Other project"),
    ).expect(201);
    projectIds.push(otherProject.body.id);
    await write(
      admin,
      tokens.admin,
      `/api/projects/${otherProject.body.id}/estimates`,
      copyPayload,
    ).expect(400);
    await write(admin, tokens.admin, path, {
      ...copyPayload,
      copiedFromEstimateId: randomUUID(),
    }).expect(400);
    await write(admin, tokens.admin, path, {
      ...copyPayload,
      currency: "USD",
    }).expect(400);
    const copied = await write(estimator, tokens.estimator, path, copyPayload).expect(201);
    estimateIds.push(copied.body.id);
    expect(copied.body.id).not.toBe(source.body.id);
    expect(copied.body.items.map(
      ({ description, unit, quantity, rate }: {
        description: string; unit: string; quantity: number; rate: number;
      }) => ({ description, unit, quantity, rate }),
    )).toEqual(copiedItems);
    expect(copied.body.items.map((item: { id: string }) => item.id)).not.toEqual(
      source.body.items.map((item: { id: string }) => item.id),
    );
    expect(copied.body.totals.baseSubtotal).toBe("350.00");
    expect(copied.body.totals.markupAmount).toBe("35.00");
    expect(copied.body.totals.tax).toBe("19.25");
    expect(copied.body.totals.total).toBe("404.25");
    const audit = await db.auditLog.findFirst({
      where: { action: "ESTIMATE_ITEMS_COPIED", entityId: copied.body.id },
    });
    expect(audit?.metadata).toEqual({
      sourceEstimateId: source.body.id,
      newEstimateId: copied.body.id,
    });
    await db.estimateItem.update({
      where: { id: source.body.items[0].id },
      data: { description: "Changed original" },
    });
    const unchanged = await viewer.get(`/api/estimates/${copied.body.id}`).expect(200);
    expect(unchanged.body.items[0].description).toBe("Concrete");
  });
  it("persists a draft and its audit record atomically", async () => {
    const result = await admin
      .post("/api/estimates")
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send(input)
      .expect(201);
    estimateIds.push(result.body.id);
    expect(result.body.number).toMatch(/^ODN-EST-\d{4,}$/);
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
      ).totalsByCurrency,
    ).toEqual({});
  });
  it("allocates unique codes across concurrent Client, Project and Estimate requests", async () => {
    const createdClients = await Promise.all(
      ["Concurrent A", "Concurrent B"].map((name) =>
        write(admin, tokens.admin, "/api/clients", clientBody(name)).expect(
          201,
        ),
      ),
    );
    clientIds.push(...createdClients.map((response) => response.body.id));
    expect(
      new Set(createdClients.map((response) => response.body.clientCode)).size,
    ).toBe(2);
    const createdProjects = await Promise.all(
      ["Concurrent Project A", "Concurrent Project B"].map((name) =>
        write(
          admin,
          tokens.admin,
          `/api/clients/${createdClients[0].body.id}/projects`,
          projectBody(name),
        ).expect(201),
      ),
    );
    projectIds.push(...createdProjects.map((response) => response.body.id));
    expect(
      new Set(createdProjects.map((response) => response.body.projectCode))
        .size,
    ).toBe(2);
    const estimatePayload = {
      description: input.description,
      estimateDate: input.estimateDate,
      currency: input.currency,
      taxPercent: input.taxPercent,
      notes: input.notes,
      items: input.items,
    };
    const createdEstimates = await Promise.all(
      [0, 1].map(() =>
        write(
          admin,
          tokens.admin,
          `/api/projects/${createdProjects[0].body.id}/estimates`,
          estimatePayload,
        ).expect(201),
      ),
    );
    estimateIds.push(...createdEstimates.map((response) => response.body.id));
    expect(
      new Set(createdEstimates.map((response) => response.body.number)).size,
    ).toBe(2);
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
  it("rejects cross-Client Project mismatches and refreshes snapshots on a valid Draft move", async () => {
    const targetClient = await write(
      admin,
      tokens.admin,
      "/api/clients",
      clientBody("Move target"),
    ).expect(201);
    clientIds.push(targetClient.body.id);
    const targetProject = await write(
      admin,
      tokens.admin,
      `/api/clients/${targetClient.body.id}/projects`,
      projectBody("Target Project"),
    ).expect(201);
    projectIds.push(targetProject.body.id);
    const source = await write(
      admin,
      tokens.admin,
      "/api/estimates",
      input,
    ).expect(201);
    estimateIds.push(source.body.id);
    const endpoint = `/api/estimates/${source.body.id}`;
    await admin
      .put(endpoint)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({ ...input, projectId: targetProject.body.id, version: 1 })
      .expect(400);
    const moved = await admin
      .put(endpoint)
      .set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", tokens.admin)
      .send({
        ...input,
        clientId: targetClient.body.id,
        projectId: targetProject.body.id,
        version: 1,
      })
      .expect(200);
    expect(moved.body.clientId).toBe(targetClient.body.id);
    expect(moved.body.projectId).toBe(targetProject.body.id);
    expect(moved.body.clientName).toBe("Move target");
    expect(moved.body.title).toBe("Target Project");
    expect(moved.body.clientNumber).toBe(targetClient.body.clientCode);
    expect(moved.body.projectCodeSnapshot).toBe(targetProject.body.projectCode);
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
    const approvedClient = await viewer.get(`/api/clients/${input.clientId}`).expect(200);
    expect(approvedClient.body.totalsByCurrency.LKR).toBe("2950.00");
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
