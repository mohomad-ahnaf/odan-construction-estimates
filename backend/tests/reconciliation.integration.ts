import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/db.js";
import { totals } from "../src/services/totals.js";
import {
  applyReconciliation,
  previewReconciliation,
  reconciliationPlanSchema,
  unlinkedEstimateReport,
} from "../src/services/reconciliation.service.js";

const estimateIds: string[] = [];
const clientIds: string[] = [];
const projectIds: string[] = [];
const newClientName = `Confirmed fixture client ${randomUUID()}`;
const newProjectName = `Confirmed fixture project ${randomUUID()}`;
let sourceId = "";
let otherId = "";
let existingClientId = "";
let otherClientId = "";
let existingProjectId = "";

beforeAll(async () => {
  const existing = await db.client.create({
    data: {
      name: "Reconciliation fixture A",
      registrationNumber: `REG-${randomUUID()}`,
    },
  });
  const other = await db.client.create({
    data: { name: "Reconciliation fixture B" },
  });
  existingClientId = existing.id;
  otherClientId = other.id;
  clientIds.push(existing.id, other.id);
  const project = await db.project.create({
    data: { clientId: existing.id, projectName: "Existing fixture project" },
  });
  existingProjectId = project.id;
  projectIds.push(project.id);
  for (const number of [0, 1]) {
    const estimate = await db.estimate.create({
      data: {
        number: `OD-RECONCILE-${randomUUID()}`,
        title: `Original project snapshot ${number}`,
        clientName: "Original client snapshot",
        clientEmail: "snapshot@example.com",
        siteAddress: "Original site snapshot",
        currency: "LKR",
        taxPercent: 18,
        notes: "Original notes snapshot",
        status: "APPROVED",
        items: {
          create: [
            {
              position: 0,
              description: "Work",
              unit: "m2",
              quantity: 2.5,
              rate: 1000,
            },
          ],
        },
      },
      include: { items: true },
    });
    estimateIds.push(estimate.id);
  }
  [sourceId, otherId] = estimateIds;
});

afterAll(async () => {
  const created = await db.client.findMany({
    where: { name: newClientName },
    select: { id: true },
  });
  for (const item of created)
    if (!clientIds.includes(item.id)) clientIds.push(item.id);
  const addedProjects = await db.project.findMany({
    where: { clientId: { in: clientIds } },
    select: { id: true },
  });
  for (const item of addedProjects)
    if (!projectIds.includes(item.id)) projectIds.push(item.id);
  await db.auditLog.deleteMany({
    where: { entityId: { in: [...estimateIds, ...clientIds, ...projectIds] } },
  });
  await db.estimate.deleteMany({ where: { id: { in: estimateIds } } });
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.client.deleteMany({ where: { id: { in: clientIds } } });
  await db.$disconnect();
});

describe("operator-assisted reconciliation", () => {
  it("reports only unlinked estimates with the requested snapshot fields", async () => {
    const rows = await unlinkedEstimateReport();
    expect(rows).toContainEqual(
      expect.objectContaining({
        id: sourceId,
        clientName: "Original client snapshot",
        title: "Original project snapshot 0",
        siteAddress: "Original site snapshot",
      }),
    );
  });

  it("rejects a project belonging to a different client before changing data", async () => {
    const plan = reconciliationPlanSchema.parse({
      newClients: [],
      newProjects: [],
      links: [
        {
          estimateId: otherId,
          classification: "E2E_TEST",
          clientRef: `id:${otherClientId}`,
          projectRef: `id:${existingProjectId}`,
        },
      ],
    });
    await expect(previewReconciliation(plan)).rejects.toThrow(
      "Project does not belong",
    );
    expect(
      (await db.estimate.findUniqueOrThrow({ where: { id: otherId } }))
        .clientId,
    ).toBeNull();
  });

  it("previews without writing, then links an approved estimate without changing its snapshot or total", async () => {
    const before = await db.estimate.findUniqueOrThrow({
      where: { id: sourceId },
      include: { items: true },
    });
    const amount = totals(before.items, before.taxPercent).total;
    const plan = reconciliationPlanSchema.parse({
      newClients: [
        { key: "confirmed", name: newClientName, email: "CONTACT@EXAMPLE.COM" },
      ],
      newProjects: [
        {
          key: "site",
          clientRef: "new:confirmed",
          projectName: newProjectName,
        },
      ],
      links: [
        {
          estimateId: sourceId,
          classification: "SAMPLE",
          clientRef: "new:confirmed",
          projectRef: "new:site",
        },
      ],
    });
    const clientCount = await db.client.count();
    const preview = await previewReconciliation(plan);
    expect(preview).toEqual([
      expect.objectContaining({
        estimateId: sourceId,
        classification: "SAMPLE",
        targetClient: newClientName,
        targetProject: newProjectName,
      }),
    ]);
    expect(await db.client.count()).toBe(clientCount);
    expect(
      (await db.estimate.findUniqueOrThrow({ where: { id: sourceId } }))
        .clientId,
    ).toBeNull();
    expect(await applyReconciliation(plan)).toEqual({
      linked: 1,
      clientsCreated: 1,
      projectsCreated: 1,
    });
    const after = await db.estimate.findUniqueOrThrow({
      where: { id: sourceId },
      include: { items: true },
    });
    clientIds.push(after.clientId!);
    projectIds.push(after.projectId!);
    expect(after.clientName).toBe(before.clientName);
    expect(after.clientEmail).toBe(before.clientEmail);
    expect(after.title).toBe(before.title);
    expect(after.siteAddress).toBe(before.siteAddress);
    expect(after.status).toBe("APPROVED");
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.estimateDate).toBeNull();
    expect(totals(after.items, after.taxPercent).total).toBe(amount);
    expect(
      (await db.client.findUniqueOrThrow({ where: { id: after.clientId! } }))
        .email,
    ).toBe("contact@example.com");
    expect(
      await db.auditLog.count({
        where: {
          action: "ESTIMATE_RECONCILED_BY_OPERATOR",
          entityId: sourceId,
        },
      }),
    ).toBe(1);
    await expect(applyReconciliation(plan)).rejects.toThrow("already linked");
  });

  it("supports selecting existing records and prevents linked Client/Project deletion", async () => {
    const plan = reconciliationPlanSchema.parse({
      newClients: [],
      newProjects: [],
      links: [
        {
          estimateId: otherId,
          classification: "E2E_TEST",
          clientRef: `id:${existingClientId}`,
          projectRef: `id:${existingProjectId}`,
        },
      ],
    });
    expect((await previewReconciliation(plan))[0].targetClient).toBe(
      "Reconciliation fixture A",
    );
    await applyReconciliation(plan);
    const row = await db.estimate.findUniqueOrThrow({ where: { id: otherId } });
    expect(row.clientId).toBe(existingClientId);
    expect(row.projectId).toBe(existingProjectId);
    await expect(
      db.project.delete({ where: { id: existingProjectId } }),
    ).rejects.toThrow();
    await expect(
      db.client.delete({ where: { id: existingClientId } }),
    ).rejects.toThrow();
  });

  it("normalizes identifiers and rejects duplicates within a proposed plan", () => {
    const plan = reconciliationPlanSchema.safeParse({
      newClients: [
        { key: "one", name: "One", registrationNumber: " reg-123 " },
        { key: "two", name: "Two", registrationNumber: "REG-123" },
      ],
      newProjects: [],
      links: [],
    });
    expect(plan.success).toBe(false);
    expect(
      reconciliationPlanSchema.safeParse({
        newClients: [],
        newProjects: [
          {
            key: "invalidDate",
            clientRef: `id:${existingClientId}`,
            projectName: "Date check",
            startDate: "2026-02-31",
          },
        ],
        links: [],
      }).success,
    ).toBe(false);
  });

  it("supports deactivation and archival while enforcing unique identifiers", async () => {
    const registrationNumber = (
      await db.client.findUniqueOrThrow({ where: { id: existingClientId } })
    ).registrationNumber!;
    await expect(
      db.client.create({
        data: { name: "Duplicate fixture", registrationNumber },
      }),
    ).rejects.toThrow();
    const vatNumber = `VAT-${randomUUID()}`;
    await db.client.update({
      where: { id: otherClientId },
      data: { active: false, vatNumber },
    });
    expect(
      (await db.client.findUniqueOrThrow({ where: { id: otherClientId } }))
        .active,
    ).toBe(false);
    await expect(
      db.client.create({ data: { name: "Duplicate VAT fixture", vatNumber } }),
    ).rejects.toThrow();
    const projectCode = `PROJECT-${randomUUID()}`;
    await db.project.update({
      where: { id: existingProjectId },
      data: { status: "ARCHIVED", projectCode },
    });
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: existingProjectId } }))
        .status,
    ).toBe("ARCHIVED");
    await expect(
      db.project.create({
        data: {
          clientId: existingClientId,
          projectName: "Duplicate code fixture",
          projectCode,
        },
      }),
    ).rejects.toThrow();
  });
});
