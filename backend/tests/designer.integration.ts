import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

const admin = request.agent(app), viewer = request.agent(app);
const users: string[] = [];
let clientId = "", projectId = "", csrf = "";
beforeAll(async () => {
  const password = randomUUID() + randomUUID();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id,
    memoryCost: 65536, timeCost: 3, parallelism: 1 });
  for (const [agent, role] of [[admin, "ADMIN"], [viewer, "VIEWER"]] as const) {
    const user = await db.user.create({ data: { email: `designer-${randomUUID()}@example.com`,
      name: "Designer test", role, passwordHash } });
    users.push(user.id);
    const session = await agent.get("/api/auth/session").expect(200);
    const login = await agent.post("/api/auth/login").set("Origin", config.ODAN_ORIGIN)
      .set("x-csrf-token", session.body.csrfToken).send({ email: user.email, password }).expect(200);
    if (role === "ADMIN") csrf = login.body.csrfToken;
  }
  const client = await db.client.create({ data: { name: "Designer integration client" } });
  clientId = client.id;
  const project = await db.project.create({ data: { clientId, projectName: "Designer integration project" } });
  projectId = project.id;
});
afterAll(async () => {
  if (projectId) {
    await db.designerModel.deleteMany({ where: { projectId } });
    await db.project.delete({ where: { id: projectId } });
  }
  if (clientId) await db.client.delete({ where: { id: clientId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
const write = (method: "post" | "put", path: string, body: unknown) =>
  admin[method](path).set("Origin", config.ODAN_ORIGIN).set("x-csrf-token", csrf).send(body);
describe("standalone 3D Designer API with PostgreSQL", () => {
  it("isolates projects, rejects stale edits, and persists canonical geometry", async () => {
    const path = `/api/projects/${projectId}/designer`;
    await viewer.get(path).expect(403);
    await write("post", path, { name: "Ground floor", floorHeightMeters: 3 }).expect(201);
    const created = await admin.get(path).expect(200);
    expect(created.body.walls).toEqual([]);
    const wallId = randomUUID();
    const wall = { id: wallId, label: "Wall A", startX: 0, startY: 0, endX: 6, endY: 0,
      heightMeters: 3, thicknessMeters: .2, alignment: "CENTRELINE",
      faces: ["A", "B"].map((side) => ({ side, roomName: null,
        plaster: true, plasterHeightMeters: 3, paint: true, paintHeightMeters: 3 })),
      openings: [{ id: randomUUID(), label: "Door", type: "DOOR", positionMeters: 1,
        widthMeters: 1, heightMeters: 2, sillMeters: 0 }] };
    const payload = { version: created.body.version, name: "Ground floor", floorHeightMeters: 3,
      walls: [wall], junctions: [] };
    await write("put", path, payload).expect(200);
    await write("put", path, payload).expect(409);
    const stored = await admin.get(path).expect(200);
    expect(stored.body.quantities.totals.netMasonryArea).toBe(16);
    expect(stored.body.quantities.totals.masonryVolume).toBeCloseTo(3.2);
    await write("post", `${path}/review`, { version: stored.body.version }).expect(200);
    const reviewed = await admin.get(path).expect(200);
    expect(reviewed.body.status).toBe("REVIEWED");
    await write("put", path, { ...payload, version: reviewed.body.version }).expect(200);
    const draft = await admin.get(path).expect(200);
    expect(draft.body.status).toBe("DRAFT");
    const adjoining = { ...wall, id: randomUUID(), label: "Wall B", startX: 3, startY: 0,
      endX: 3, endY: 4, openings: [] };
    const junction = { id: randomUUID(), continuousWallId: wall.id,
      adjoiningWallId: adjoining.id, adjoiningEnd: "START" };
    await write("put", path, { ...payload, version: draft.body.version,
      walls: [wall, adjoining], junctions: [junction] }).expect(200);
    const joined = await admin.get(path).expect(200);
    expect(joined.body.junctions).toEqual([junction]);
    expect(joined.body.quantities.totals.junctionDeduction).toBeCloseTo(.3);
    expect(joined.body.quantities.totals.masonryVolume).toBeCloseTo((16 + 12 - .3) * .2);
    expect(joined.body.quantities.issues).toEqual([]);
    await write("post", `${path}/review`, { version: joined.body.version }).expect(200);
    const joinedReviewed = await admin.get(path).expect(200);
    expect(joinedReviewed.body.status).toBe("REVIEWED");
    await write("put", path, { ...payload, version: joinedReviewed.body.version,
      walls: [wall, adjoining], junctions: [] }).expect(200);
    const disconnected = await admin.get(path).expect(200);
    expect(disconnected.body.status).toBe("DRAFT");
    expect(disconnected.body.quantities.issues.length).toBeGreaterThan(0);
    await write("post", `${path}/review`, { version: disconnected.body.version }).expect(409);
    await admin.get(`/api/projects/${randomUUID()}/designer`).expect(404);
  });
});
