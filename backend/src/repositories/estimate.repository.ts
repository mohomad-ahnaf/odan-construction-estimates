import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import type { EstimateInput } from "../validation.js";
import { AppError } from "../middleware/errors.js";
const include = { items: { orderBy: { position: "asc" as const } } };
const snapshot = async (tx: Prisma.TransactionClient, input: EstimateInput) => {
  const [client, project] = await Promise.all([
    tx.client.findUnique({ where: { id: input.clientId } }),
    tx.project.findUnique({ where: { id: input.projectId } }),
  ]);
  if (
    !client ||
    !project ||
    project.clientId !== client.id ||
    !client.active ||
    project.status !== "ACTIVE"
  )
    throw new AppError(
      400,
      "Select an active project belonging to an active client",
    );
  return {
    title: project.projectName,
    clientName: client.name,
    clientEmail: client.email,
    siteAddress: project.siteAddress ?? "",
  };
};
const dataFor = (input: EstimateInput) => ({
  clientId: input.clientId,
  projectId: input.projectId,
  estimateDate: new Date(`${input.estimateDate}T00:00:00.000Z`),
  currency: input.currency,
  taxPercent: input.taxPercent,
  notes: input.notes,
});
const itemsFor = (input: EstimateInput) =>
  input.items.map((item, position) => ({ ...item, position }));
export const estimateRepository = {
  list: (search: string, page: number) =>
    db.$transaction([
      db.estimate.findMany({
        where: {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { clientName: { contains: search, mode: "insensitive" } },
            { number: { contains: search, mode: "insensitive" } },
          ],
        },
        include,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.estimate.count({
        where: {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { clientName: { contains: search, mode: "insensitive" } },
            { number: { contains: search, mode: "insensitive" } },
          ],
        },
      }),
    ]),
  get: (id: string) => db.estimate.findUnique({ where: { id }, include }),
  create: (input: EstimateInput, number: string, actorId: string) =>
    db.$transaction(async (tx) => {
      const names = await snapshot(tx, input);
      const estimate = await tx.estimate.create({
        data: {
          ...dataFor(input),
          ...names,
          number,
          items: { create: itemsFor(input) },
        },
        include,
      });
      await tx.auditLog.create({
        data: { actorId, action: "ESTIMATE_CREATED", entityId: estimate.id },
      });
      return estimate;
    }),
  update: (
    id: string,
    input: EstimateInput,
    version: number,
    actorId: string,
  ) =>
    db.$transaction(async (tx) => {
      const current = await tx.estimate.findUnique({ where: { id } });
      if (!current || current.status !== "DRAFT" || current.version !== version)
        throw new AppError(
          409,
          "Estimate changed or is no longer a draft. Reload before editing.",
        );
      const relationshipChanged =
        current.clientId !== input.clientId ||
        current.projectId !== input.projectId;
      const names = relationshipChanged ? await snapshot(tx, input) : {};
      const result = await tx.estimate.updateMany({
        where: { id, version, status: "DRAFT" },
        data: {
          ...dataFor(input),
          ...names,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new AppError(
          409,
          "Estimate changed or is no longer a draft. Reload before editing.",
        );
      await tx.estimateItem.deleteMany({ where: { estimateId: id } });
      await tx.estimateItem.createMany({
        data: itemsFor(input).map((item) => ({ ...item, estimateId: id })),
      });
      await tx.auditLog.create({
        data: { actorId, action: "ESTIMATE_UPDATED", entityId: id },
      });
      return tx.estimate.findUniqueOrThrow({ where: { id }, include });
    }),
  status: (
    id: string,
    version: number,
    from: Prisma.EnumEstimateStatusFilter["equals"],
    status: "DRAFT" | "SENT" | "APPROVED" | "REJECTED",
    actorId: string,
  ) =>
    db.$transaction(async (tx) => {
      const result = await tx.estimate.updateMany({
        where: { id, version, status: from },
        data: { status, version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new AppError(409, "Estimate changed. Reload before updating.");
      await tx.auditLog.create({
        data: { actorId, action: `ESTIMATE_${status}`, entityId: id },
      });
      return tx.estimate.findUniqueOrThrow({ where: { id }, include });
    }),
  audit: (actorId: string, action: string, entityId: string) =>
    db.auditLog.create({ data: { actorId, action, entityId } }),
  auditList: () =>
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
};
