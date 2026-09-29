import { Prisma, type EstimateStatus } from "@prisma/client";
import { db } from "../db.js";
import { AppError } from "../middleware/errors.js";
import type { ClientEstimateInput } from "../client-estimate.validation.js";
import {
  clientEstimateGrandTotal,
  selectedEstimateSnapshot,
  type SavedSnapshot,
} from "../services/client-estimate-calculation.js";
import { nextCode } from "./code.repository.js";

const include = { items: { orderBy: { position: "asc" as const } } };

async function projectFor(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) throw new AppError(404, "Project not found");
  return project;
}

type PreviousRow = SavedSnapshot & {
  sourceEstimateId: string;
};

async function snapshotRows(
  tx: Prisma.TransactionClient,
  projectId: string,
  clientId: string,
  selections: ClientEstimateInput["items"],
  previous: PreviousRow[] = [],
) {
  const ids = selections.map((item) => item.sourceEstimateId);
  const sources = await tx.estimate.findMany({
    where: { id: { in: ids }, projectId, clientId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (sources.length !== ids.length)
    throw new AppError(400, "Select estimates belonging to this Project");
  const byId = new Map(sources.map((source) => [source.id, source]));
  const previousById = new Map(
    previous.map((row) => [row.sourceEstimateId, row]),
  );
  const rows = selections.map((selection, position) => {
    const source = byId.get(selection.sourceEstimateId)!;
    const saved = previousById.get(selection.sourceEstimateId);
    const snapshot = selectedEstimateSnapshot(
      source,
      saved,
      selection.refreshSnapshot,
    );
    return {
      ...snapshot,
      sourceEstimateId: selection.sourceEstimateId,
      position,
      quantity: new Prisma.Decimal(1),
    };
  });
  const currency = rows[0].currencySnapshot;
  if (rows.some((row) => row.currencySnapshot !== currency))
    throw new AppError(400, "Selected estimates must use the same currency");
  const grandTotal = clientEstimateGrandTotal(rows);
  return { rows, currency, grandTotal };
}

export const clientEstimateRepository = {
  get: (id: string) => db.clientEstimate.findUnique({ where: { id }, include }),
  listForProject: async (projectId: string, page: number) => {
    if (
      !(await db.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      }))
    )
      throw new AppError(404, "Project not found");
    const where = { projectId };
    return db.$transaction([
      db.clientEstimate.findMany({
        where,
        include,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.clientEstimate.count({ where }),
    ]);
  },
  create: (projectId: string, input: ClientEstimateInput, actorId: string) =>
    db.$transaction(async (tx) => {
      const project = await projectFor(tx, projectId);
      if (!project.client.active || project.status !== "ACTIVE")
        throw new AppError(400, "Select an active Project and Client");
      const { rows, currency, grandTotal } = await snapshotRows(
        tx,
        project.id,
        project.clientId,
        input.items,
      );
      const result = await tx.clientEstimate.create({
        data: {
          clientEstimateNumber: await nextCode(tx, "clientEstimate"),
          projectId: project.id,
          clientId: project.clientId,
          clientNameSnapshot: project.client.name,
          clientNumberSnapshot: project.client.clientCode,
          projectNameSnapshot: project.projectName,
          projectCodeSnapshot: project.projectCode,
          clientEstimateDate: new Date(
            `${input.clientEstimateDate}T00:00:00.000Z`,
          ),
          title: input.title,
          notes: input.notes,
          currency,
          grandTotalSnapshot: grandTotal,
          createdById: actorId,
          items: { create: rows },
        },
        include,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "CLIENT_ESTIMATE_CREATED",
          entityId: result.id,
        },
      });
      return result;
    }),
  update: (
    id: string,
    input: ClientEstimateInput,
    version: number,
    actorId: string,
  ) =>
    db.$transaction(async (tx) => {
      const current = await tx.clientEstimate.findUnique({
        where: { id },
        include,
      });
      if (!current) throw new AppError(404, "Client Estimate not found");
      if (current.status !== "DRAFT" || current.version !== version)
        throw new AppError(
          409,
          "Client Estimate changed or is no longer a Draft",
        );
      const project = await projectFor(tx, current.projectId);
      if (project.clientId !== current.clientId)
        throw new AppError(409, "Client Estimate relationship is inconsistent");
      const { rows, currency, grandTotal } = await snapshotRows(
        tx,
        current.projectId,
        current.clientId,
        input.items,
        current.items,
      );
      const updated = await tx.clientEstimate.updateMany({
        where: { id, version, status: "DRAFT" },
        data: {
          clientEstimateDate: new Date(
            `${input.clientEstimateDate}T00:00:00.000Z`,
          ),
          title: input.title,
          notes: input.notes,
          currency,
          grandTotalSnapshot: grandTotal,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new AppError(
          409,
          "Client Estimate changed. Reload before editing",
        );
      await tx.clientEstimateItem.deleteMany({
        where: { clientEstimateId: id },
      });
      await tx.clientEstimateItem.createMany({
        data: rows.map((row) => ({ ...row, clientEstimateId: id })),
      });
      await tx.auditLog.create({
        data: { actorId, action: "CLIENT_ESTIMATE_UPDATED", entityId: id },
      });
      return tx.clientEstimate.findUniqueOrThrow({ where: { id }, include });
    }),
  status: (
    id: string,
    from: EstimateStatus,
    to: EstimateStatus,
    version: number,
    actorId: string,
  ) =>
    db.$transaction(async (tx) => {
      const updated = await tx.clientEstimate.updateMany({
        where: { id, version, status: from },
        data: { status: to, version: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new AppError(
          409,
          "Client Estimate changed. Reload before updating",
        );
      await tx.auditLog.create({
        data: { actorId, action: `CLIENT_ESTIMATE_${to}`, entityId: id },
      });
      return tx.clientEstimate.findUniqueOrThrow({ where: { id }, include });
    }),
  auditExport: (id: string, actorId: string, format: string) =>
    db.auditLog.create({
      data: {
        actorId,
        action: `CLIENT_ESTIMATE_EXPORT_${format}`,
        entityId: id,
      },
    }),
};
