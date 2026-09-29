import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { db } from "../db.js";
import { nextCode } from "../repositories/code.repository.js";

const optionalText = (length: number) =>
  z.string().trim().min(1).max(length).optional();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const ref = z.string().regex(/^(new:[A-Za-z0-9_-]{1,40}|id:[0-9a-fA-F-]{36})$/);
const key = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const newClient = z
  .object({
    key,
    name: z.string().trim().min(1).max(160),
    address: optionalText(500),
    contactPerson: optionalText(160),
    telephone: optionalText(40),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase())
      .optional(),
    notes: optionalText(4000),
    active: z.boolean().default(true),
  })
  .strict();
const newProject = z
  .object({
    key,
    clientRef: ref,
    projectName: z.string().trim().min(1).max(160),
    siteAddress: optionalText(500),
    description: optionalText(4000),
    status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
    startDate: date.optional(),
  })
  .strict();
const link = z
  .object({
    estimateId: z.string().uuid(),
    clientRef: ref,
    projectRef: ref,
    classification: z.enum(["REAL", "SAMPLE", "E2E_TEST"]),
  })
  .strict();
export const reconciliationPlanSchema = z
  .object({
    newClients: z.array(newClient),
    newProjects: z.array(newProject),
    links: z.array(link),
  })
  .strict()
  .superRefine((value, ctx) => {
    const checks: [string[], string][] = [
      [value.newClients.map((item) => item.key), "client key"],
      [value.newProjects.map((item) => item.key), "project key"],
      [value.links.map((item) => item.estimateId), "estimate ID"],
    ];
    for (const [values, label] of checks)
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${label}` });
  });
export type ReconciliationPlan = z.infer<typeof reconciliationPlanSchema>;
type Tx = Prisma.TransactionClient;
type PreviewRow = {
  estimateId: string;
  classification: "REAL" | "SAMPLE" | "E2E_TEST";
  number: string;
  clientName: string;
  title: string;
  siteAddress: string;
  targetClient: string;
  targetProject: string;
};

function reference(value: string) {
  const [kind, id] = value.split(":", 2);
  if (kind === "id") z.string().uuid().parse(id);
  return { kind, id };
}

export async function unlinkedEstimateReport(client: PrismaClient | Tx = db) {
  return client.estimate.findMany({
    where: { OR: [{ clientId: null }, { projectId: null }] },
    select: {
      id: true,
      number: true,
      clientName: true,
      title: true,
      siteAddress: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function validatePlan(
  tx: Tx,
  plan: ReconciliationPlan,
): Promise<PreviewRow[]> {
  const clients = new Map(
    plan.newClients.map((item) => [
      `new:${item.key}`,
      { id: null as string | null, name: item.name },
    ]),
  );
  const projects = new Map(
    plan.newProjects.map((item) => [
      `new:${item.key}`,
      {
        id: null as string | null,
        name: item.projectName,
        clientRef: item.clientRef,
      },
    ]),
  );
  const clientRefs = new Set([
    ...plan.newProjects.map((item) => item.clientRef),
    ...plan.links.map((item) => item.clientRef),
  ]);
  const projectRefs = new Set(plan.links.map((item) => item.projectRef));
  for (const item of plan.newClients)
    if (!clientRefs.has(`new:${item.key}`))
      throw new Error("Unreferenced new client");
  for (const item of plan.newProjects)
    if (!projectRefs.has(`new:${item.key}`))
      throw new Error("Unreferenced new project");
  for (const ref of clientRefs) {
    if (clients.has(ref)) continue;
    const parsed = reference(ref);
    if (parsed.kind !== "id") throw new Error("Unknown client reference");
    const found = await tx.client.findUnique({ where: { id: parsed.id } });
    if (!found) throw new Error("Unknown client reference");
    clients.set(ref, { id: found.id, name: found.name });
  }
  for (const ref of projectRefs) {
    if (projects.has(ref)) continue;
    const parsed = reference(ref);
    if (parsed.kind !== "id") throw new Error("Unknown project reference");
    const found = await tx.project.findUnique({ where: { id: parsed.id } });
    if (!found) throw new Error("Unknown project reference");
    projects.set(ref, {
      id: found.id,
      name: found.projectName,
      clientRef: `id:${found.clientId}`,
    });
  }
  const estimates = await tx.estimate.findMany({
    where: { id: { in: plan.links.map((item) => item.estimateId) } },
    select: {
      id: true,
      number: true,
      clientName: true,
      title: true,
      siteAddress: true,
      clientId: true,
      projectId: true,
    },
  });
  const byId = new Map(estimates.map((item) => [item.id, item]));
  return plan.links.map((item) => {
    const estimate = byId.get(item.estimateId);
    const client = clients.get(item.clientRef);
    const project = projects.get(item.projectRef);
    if (!estimate || estimate.clientId || estimate.projectId)
      throw new Error("Estimate is missing or already linked");
    if (!client || !project || project.clientRef !== item.clientRef)
      throw new Error("Project does not belong to the selected client");
    return {
      estimateId: estimate.id,
      classification: item.classification,
      number: estimate.number,
      clientName: estimate.clientName,
      title: estimate.title,
      siteAddress: estimate.siteAddress,
      targetClient: client.name,
      targetProject: project.name,
    };
  });
}

export async function previewReconciliation(plan: ReconciliationPlan) {
  return db.$transaction((tx) => validatePlan(tx, plan));
}

export async function applyReconciliation(plan: ReconciliationPlan) {
  if (!plan.links.length) throw new Error("No estimates selected");
  return db.$transaction(
    async (tx) => {
      await validatePlan(tx, plan);
      const clientIds = new Map<string, string>();
      for (const item of plan.newClients) {
        const { key: localKey, ...data } = item;
        const created = await tx.client.create({
          data: { ...data, clientCode: await nextCode(tx, "client") },
        });
        clientIds.set(`new:${localKey}`, created.id);
        await tx.auditLog.create({
          data: {
            action: "CLIENT_CREATED_BY_RECONCILIATION",
            entityId: created.id,
          },
        });
      }
      const resolveClient = (value: string) =>
        clientIds.get(value) ?? reference(value).id;
      const projectIds = new Map<string, string>();
      for (const item of plan.newProjects) {
        const { key: localKey, clientRef, startDate, ...data } = item;
        const created = await tx.project.create({
          data: {
            ...data,
            projectCode: await nextCode(tx, "project"),
            clientId: resolveClient(clientRef),
            startDate: startDate
              ? new Date(`${startDate}T00:00:00.000Z`)
              : null,
          },
        });
        projectIds.set(`new:${localKey}`, created.id);
        await tx.auditLog.create({
          data: {
            action: "PROJECT_CREATED_BY_RECONCILIATION",
            entityId: created.id,
          },
        });
      }
      for (const item of plan.links) {
        const clientId = resolveClient(item.clientRef);
        const projectId =
          projectIds.get(item.projectRef) ?? reference(item.projectRef).id;
        const changed = await tx.$executeRaw`
        UPDATE "Estimate"
        SET "clientId" = ${clientId}, "projectId" = ${projectId}
        WHERE "id" = ${item.estimateId} AND "clientId" IS NULL AND "projectId" IS NULL
      `;
        if (changed !== 1)
          throw new Error("Estimate changed during reconciliation");
        await tx.auditLog.create({
          data: {
            action: "ESTIMATE_RECONCILED_BY_OPERATOR",
            entityId: item.estimateId,
          },
        });
      }
      return {
        linked: plan.links.length,
        clientsCreated: plan.newClients.length,
        projectsCreated: plan.newProjects.length,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
