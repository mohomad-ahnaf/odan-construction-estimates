import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", async () => {
  const { default: pino } = await import("pino");
  return { logger: pino({ enabled: false }) };
});

import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { db } from "../src/db.js";

const admin = request.agent(app);
const estimator = request.agent(app);
const ids = {
  users: [] as string[],
  documents: [] as string[],
  project: "",
  client: "",
};
let adminCsrf = "";
let estimatorCsrf = "";

async function signIn(agent: ReturnType<typeof request.agent>, role: "ADMIN" | "ESTIMATOR") {
  const password = `${randomUUID()}${randomUUID()}`;
  const user = await db.user.create({
    data: {
      email: `plan-groups-${randomUUID()}@example.test`,
      name: `Plan groups ${role}`,
      role,
      passwordHash: await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
    },
  });
  ids.users.push(user.id);
  const session = await agent.get("/api/auth/session").expect(200);
  const login = await agent
    .post("/api/auth/login")
    .set("Origin", config.ODAN_ORIGIN)
    .set("x-csrf-token", session.body.csrfToken)
    .send({ email: user.email, password })
    .expect(200);
  return { user, csrf: login.body.csrfToken as string };
}

function write(
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  method: "post" | "put" | "delete",
  path: string,
  body: unknown,
) {
  return agent[method](path)
    .set("Origin", config.ODAN_ORIGIN)
    .set("x-csrf-token", csrf)
    .send(body);
}

beforeAll(async () => {
  const adminLogin = await signIn(admin, "ADMIN");
  const estimatorLogin = await signIn(estimator, "ESTIMATOR");
  adminCsrf = adminLogin.csrf;
  estimatorCsrf = estimatorLogin.csrf;

  const client = await db.client.create({ data: { name: "Plan group integration client" } });
  ids.client = client.id;
  const project = await db.project.create({
    data: { clientId: client.id, projectName: "Plan group integration project" },
  });
  ids.project = project.id;

  const revisionGroup = randomUUID();
  for (const input of [
    { fileName: "Drawing A revision 1.pdf", versionGroupId: revisionGroup, version: 1 },
    { fileName: "Drawing A revision 2.pdf", versionGroupId: revisionGroup, version: 2 },
    { fileName: "Drawing B revision 1.pdf", versionGroupId: randomUUID(), version: 1 },
  ]) {
    const document = await db.document.create({
      data: {
        projectId: project.id,
        uploadedBy: adminLogin.user.id,
        fileName: input.fileName,
        fileType: "application/pdf",
        fileSize: 100,
        category: "DRAWINGS",
        googleDriveFileId: `test-${randomUUID()}`,
        googleDriveFolderId: "test-folder",
        versionGroupId: input.versionGroupId,
        version: input.version,
        isLatest: input.version === 2 || input.fileName.startsWith("Drawing B"),
      },
    });
    ids.documents.push(document.id);
  }
});

afterAll(async () => {
  await db.planMeasurement.deleteMany({ where: { documentId: { in: ids.documents } } });
  await db.planMeasurementGroup.deleteMany({ where: { documentId: { in: ids.documents } } });
  await db.document.deleteMany({ where: { id: { in: ids.documents } } });
  if (ids.project) await db.project.delete({ where: { id: ids.project } });
  if (ids.client) await db.client.delete({ where: { id: ids.client } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids.users } } });
  await db.user.deleteMany({ where: { id: { in: ids.users } } });
  await db.$disconnect();
});

describe("measurement groups with real PostgreSQL and HTTP", () => {
  it("isolates groups by exact document revision and enforces safe moves and deletion", async () => {
    const [revisionOne, revisionTwo, anotherDrawing] = ids.documents;
    const groups = [];
    for (const documentId of ids.documents) {
      const response = await write(
        admin,
        adminCsrf,
        "post",
        `/api/projects/${ids.project}/plans/${documentId}/measurement-groups`,
        { name: "Takeoff" },
      ).expect(201);
      groups.push(response.body);
    }

    expect(new Set(groups.map((group) => group.documentId))).toEqual(
      new Set([revisionOne, revisionTwo, anotherDrawing]),
    );
    await estimator
      .get(`/api/projects/${ids.project}/plans/${revisionOne}/measurement-groups`)
      .expect(403);

    const renamed = await write(
      admin,
      adminCsrf,
      "put",
      `/api/plan-measurement-groups/${groups[0].id}`,
      { name: "Revision one takeoff", version: groups[0].version },
    ).expect(200);
    expect(renamed.body.name).toBe("Revision one takeoff");

    const destination = await write(
      admin,
      adminCsrf,
      "post",
      `/api/projects/${ids.project}/plans/${revisionOne}/measurement-groups`,
      { name: "Moved quantities" },
    ).expect(201);

    const measurement = await write(
      admin,
      adminCsrf,
      "post",
      `/api/projects/${ids.project}/plans/${revisionOne}/measurements`,
      {
        groupId: groups[0].id,
        pageNumber: 2,
        pageWidth: 1000,
        pageHeight: 700,
        type: "COUNT",
        label: "Doors",
        geometry: { points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
      },
    ).expect(201);
    expect(measurement.body).toMatchObject({ pageNumber: 2, quantity: "2", groupId: groups[0].id });

    await write(
      admin,
      adminCsrf,
      "post",
      `/api/projects/${ids.project}/plans/${revisionTwo}/measurements`,
      {
        groupId: groups[0].id,
        pageNumber: 1,
        pageWidth: 1000,
        pageHeight: 700,
        type: "COUNT",
        label: "Invalid cross-revision assignment",
        geometry: { points: [{ x: 10, y: 10 }] },
      },
    ).expect(409);

    await write(
      admin,
      adminCsrf,
      "delete",
      `/api/plan-measurement-groups/${groups[0].id}`,
      { version: renamed.body.version },
    ).expect(409);

    await write(
      admin,
      adminCsrf,
      "delete",
      `/api/plan-measurement-groups/${groups[0].id}`,
      { version: renamed.body.version, destinationGroupId: groups[1].id },
    ).expect(409);

    const movedAndDeleted = await write(
      admin,
      adminCsrf,
      "delete",
      `/api/plan-measurement-groups/${groups[0].id}`,
      { version: renamed.body.version, destinationGroupId: destination.body.id },
    ).expect(200);
    expect(movedAndDeleted.body).toEqual({ destinationGroupId: destination.body.id, movedCount: 1 });
    const preserved = await db.planMeasurement.findUniqueOrThrow({ where: { id: measurement.body.id } });
    expect(preserved).toMatchObject({
      documentId: revisionOne,
      groupId: destination.body.id,
      pageNumber: 2,
      label: "Doors",
      type: "COUNT",
      confirmed: false,
      geometry: { points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
    });
    expect(preserved.quantity.toString()).toBe("2");

    const revisionOneGroups = await admin
      .get(`/api/projects/${ids.project}/plans/${revisionOne}/measurement-groups`)
      .expect(200);
    const revisionTwoGroups = await admin
      .get(`/api/projects/${ids.project}/plans/${revisionTwo}/measurement-groups`)
      .expect(200);
    expect(revisionOneGroups.body.map((group: { name: string }) => group.name)).toEqual(["Moved quantities"]);
    expect(revisionTwoGroups.body.map((group: { name: string }) => group.name)).toEqual(["Takeoff"]);

    const empty = await write(admin, adminCsrf, "post",
      `/api/projects/${ids.project}/plans/${revisionOne}/measurement-groups`,
      { name: "Empty takeoff" }).expect(201);
    await write(admin, adminCsrf, "delete",
      `/api/plan-measurement-groups/${empty.body.id}`,
      { version: empty.body.version }).expect(200, { destinationGroupId: null, movedCount: 0 });

    const anotherMeasurement = await write(admin, adminCsrf, "post",
      `/api/projects/${ids.project}/plans/${anotherDrawing}/measurements`, {
        groupId: groups[2].id,
        pageNumber: 1,
        pageWidth: 1000,
        pageHeight: 700,
        type: "COUNT",
        label: "Columns",
        geometry: { points: [{ x: 45, y: 55 }] },
      }).expect(201);
    const createdAndMoved = await write(admin, adminCsrf, "delete",
      `/api/plan-measurement-groups/${groups[2].id}`, {
        version: groups[2].version,
        newGroupName: "New drawing group",
      }).expect(200);
    expect(createdAndMoved.body.movedCount).toBe(1);
    const preservedNew = await db.planMeasurement.findUniqueOrThrow({ where: { id: anotherMeasurement.body.id } });
    expect(preservedNew.groupId).toBe(createdAndMoved.body.destinationGroupId);
    expect(preservedNew.label).toBe("Columns");
    expect(preservedNew.geometry).toEqual({ points: [{ x: 45, y: 55 }] });
  });
});
