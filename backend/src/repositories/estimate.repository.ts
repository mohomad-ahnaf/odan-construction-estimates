import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { itemSchema, type EstimateInput, type EstimateUpdateInput } from "../validation.js";
import { AppError } from "../middleware/errors.js";
import { nextCode } from "./code.repository.js";
const include = {
  items: { orderBy: { position: "asc" as const } },
  client: { select: { clientCode: true, address: true } },
};
const snapshot = async (
  tx: Prisma.TransactionClient,
  input: EstimateUpdateInput,
) => {
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
    projectCodeSnapshot: project.projectCode,
    siteAddress: project.siteAddress ?? "",
  };
};
const dataFor = (input: EstimateUpdateInput) => ({
  clientId: input.clientId,
  projectId: input.projectId,
  estimateDate: new Date(`${input.estimateDate}T00:00:00.000Z`),
  currency: input.currency,
  markupPercent: input.markupPercent,
  taxPercent: input.taxPercent,
  notes: input.notes,
});
const itemsFor = (input: EstimateUpdateInput) =>
  input.items.map((item, position) => ({ ...item, position }));
export const estimateRepository = {
  project: (id: string) =>
    db.project.findUnique({
      where: { id },
      select: { id: true, clientId: true },
    }),
  listForProject: (
    projectId: string,
    search: string,
    page: number,
    status?: "DRAFT" | "SENT" | "APPROVED" | "REJECTED",
  ) => {
    const where: Prisma.EstimateWhereInput = {
      projectId,
      ...(status ? { status } : {}),
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    };
    return db.$transaction([
      db.estimate.findMany({
        where,
        include,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.estimate.count({ where }),
    ]);
  },
  list: (search: string, page: number) =>
    db.$transaction([
      db.estimate.findMany({
        where: {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
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
            { description: { contains: search, mode: "insensitive" } },
            { clientName: { contains: search, mode: "insensitive" } },
            { number: { contains: search, mode: "insensitive" } },
          ],
        },
      }),
    ]),
  get: (id: string) => db.estimate.findUnique({ where: { id }, include }),
  create: (input: EstimateInput, actorId: string, copiedFromEstimateId?: string) =>
    db.$transaction(async (tx) => {
      const names = await snapshot(tx, input);
      if (copiedFromEstimateId) {
        const source = await tx.estimate.findUnique({
          where: { id: copiedFromEstimateId },
          select: {
            clientId: true,
            projectId: true,
            currency: true,
            items: { select: { description: true, unit: true, quantity: true, rate: true } },
          },
        });
        if (
          !source ||
          source.projectId !== input.projectId ||
          source.clientId !== input.clientId ||
          source.currency !== input.currency ||
          !itemSchema.array().min(1).max(100).safeParse(
            source.items.map((item) => ({
              description: item.description,
              unit: item.unit,
              quantity: Number(item.quantity),
              rate: Number(item.rate),
            })),
          ).success
        )
          throw new AppError(400, "Selected source estimate is unavailable for this Project or currency");
      }
      const estimate = await tx.estimate.create({
        data: {
          ...dataFor(input),
          description: input.description,
          ...names,
          number: await nextCode(tx, "estimate"),
          items: { create: itemsFor(input) },
        },
        include,
      });
      await tx.auditLog.create({
        data: { actorId, action: "ESTIMATE_CREATED", entityId: estimate.id },
      });
      if (copiedFromEstimateId) {
        await tx.auditLog.create({
          data: {
            actorId,
            action: "ESTIMATE_ITEMS_COPIED",
            entityId: estimate.id,
            metadata: {
              sourceEstimateId: copiedFromEstimateId,
              newEstimateId: estimate.id,
            },
          },
        });
      }
      return estimate;
    }),
  update: (
    id: string,
    input: EstimateUpdateInput,
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
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
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
