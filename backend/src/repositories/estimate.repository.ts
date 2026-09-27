import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import type { EstimateInput } from "../validation.js";
import { AppError } from "../middleware/errors.js";
const include = { items: { orderBy: { position: "asc" as const } } };
const dataFor = (input: EstimateInput) => ({
  ...input,
  clientEmail: input.clientEmail || null,
  items: undefined,
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
      const estimate = await tx.estimate.create({
        data: { ...dataFor(input), number, items: { create: itemsFor(input) } },
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
      const result = await tx.estimate.updateMany({
        where: { id, version, status: "DRAFT" },
        data: { ...dataFor(input), version: { increment: 1 } },
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
