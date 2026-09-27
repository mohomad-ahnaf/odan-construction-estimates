import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { totals } from "../services/totals.js";
import type { z } from "zod";
import type { clientSchema, listSchema, projectSchema } from "../validation.js";
import { AppError } from "../middleware/errors.js";

type ClientInput = z.infer<typeof clientSchema>;
type ProjectInput = z.infer<typeof projectSchema>;
type ListInput = z.infer<typeof listSchema>;
const sumByCurrency = (
  estimates: {
    currency: string;
    taxPercent: Prisma.Decimal;
    items: { quantity: Prisma.Decimal; rate: Prisma.Decimal }[];
  }[],
) => {
  const values: Record<string, Prisma.Decimal> = {};
  for (const estimate of estimates)
    values[estimate.currency] = (
      values[estimate.currency] ?? new Prisma.Decimal(0)
    ).add(totals(estimate.items, estimate.taxPercent).total);
  return Object.fromEntries(
    Object.entries(values).map(([currency, value]) => [
      currency,
      value.toFixed(2),
    ]),
  );
};
const moneySelect = {
  currency: true,
  taxPercent: true,
  items: { select: { quantity: true, rate: true } },
} as const;
const clientInclude = {
  _count: { select: { projects: true, estimates: true } },
  estimates: { select: moneySelect },
} as const;
const present = <T>(row: T | null): T => {
  if (!row) throw new AppError(404, "Record not found");
  return row;
};
function cleanClient(
  row: Prisma.ClientGetPayload<{ include: typeof clientInclude }>,
) {
  const { estimates, _count, ...client } = row;
  return {
    ...client,
    projectCount: _count.projects,
    estimateCount: _count.estimates,
    totalsByCurrency: sumByCurrency(estimates),
  };
}
function uniqueError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    throw new AppError(409, "Identifier already in use");
  throw error;
}
async function uniqueClient(input: ClientInput, id?: string) {
  for (const field of ["registrationNumber", "vatNumber"] as const)
    if (input[field]) {
      const found = await db.client.findFirst({
        where: {
          id: { not: id },
          [field]: { equals: input[field]!, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (found) throw new AppError(409, "Identifier already in use");
    }
}
async function uniqueProject(input: ProjectInput, id?: string) {
  if (
    input.projectCode &&
    (await db.project.findFirst({
      where: {
        id: { not: id },
        projectCode: { equals: input.projectCode, mode: "insensitive" },
      },
      select: { id: true },
    }))
  )
    throw new AppError(409, "Identifier already in use");
}
const date = (value: string | null) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;
const projectData = (input: ProjectInput) => ({
  ...input,
  startDate: date(input.startDate),
  completionDate: date(input.completionDate),
});
const projectOutput = (
  project: NonNullable<Awaited<ReturnType<typeof db.project.findUnique>>>,
) => ({
  ...project,
  startDate: project.startDate?.toISOString().slice(0, 10) ?? null,
  completionDate: project.completionDate?.toISOString().slice(0, 10) ?? null,
});
export const clientRepository = {
  async list(query: ListInput) {
    const where: Prisma.ClientWhereInput = {
      AND: [
        query.active === undefined ? {} : { active: query.active === "true" },
        {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { contactPerson: { contains: query.search, mode: "insensitive" } },
            {
              registrationNumber: {
                contains: query.search,
                mode: "insensitive",
              },
            },
          ],
        },
      ],
    };
    const [rows, total] = await db.$transaction([
      db.client.findMany({
        where,
        include: clientInclude,
        orderBy: [{ [query.sort]: query.direction }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.client.count({ where }),
    ]);
    return {
      data: rows.map(cleanClient),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },
  async get(id: string) {
    return cleanClient(
      present(
        await db.client.findUnique({ where: { id }, include: clientInclude }),
      ),
    );
  },
  async create(input: ClientInput, actorId: string) {
    await uniqueClient(input);
    try {
      const row = await db.$transaction(async (tx) => {
        const created = await tx.client.create({ data: input });
        await tx.auditLog.create({
          data: { actorId, action: "CLIENT_CREATED", entityId: created.id },
        });
        return created;
      });
      return this.get(row.id);
    } catch (e) {
      uniqueError(e);
    }
  },
  async update(id: string, input: ClientInput, actorId: string) {
    await this.get(id);
    await uniqueClient(input, id);
    try {
      await db.$transaction(async (tx) => {
        await tx.client.update({ where: { id }, data: input });
        await tx.auditLog.create({
          data: { actorId, action: "CLIENT_UPDATED", entityId: id },
        });
      });
      return this.get(id);
    } catch (e) {
      uniqueError(e);
    }
  },
  async status(id: string, active: boolean, actorId: string) {
    await this.get(id);
    await db.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { active } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: active ? "CLIENT_ACTIVATED" : "CLIENT_DEACTIVATED",
          entityId: id,
        },
      });
    });
    return this.get(id);
  },
  async projects(clientId: string, query: ListInput) {
    await this.get(clientId);
    const where: Prisma.ProjectWhereInput = {
      clientId,
      ...(query.active === undefined
        ? {}
        : { status: query.active === "true" ? "ACTIVE" : "ARCHIVED" }),
      OR: [
        { projectName: { contains: query.search, mode: "insensitive" } },
        { projectCode: { contains: query.search, mode: "insensitive" } },
      ],
    };
    const [rows, total] = await db.$transaction([
      db.project.findMany({
        where,
        orderBy: [
          {
            [query.sort === "name" ? "projectName" : "createdAt"]:
              query.direction,
          },
          { id: "asc" },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.project.count({ where }),
    ]);
    return {
      data: rows.map(projectOutput),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },
  async estimates(clientId: string, query: ListInput) {
    await this.get(clientId);
    const where: Prisma.EstimateWhereInput = {
      clientId,
      OR: [
        { number: { contains: query.search, mode: "insensitive" } },
        { title: { contains: query.search, mode: "insensitive" } },
      ],
    };
    const [rows, total] = await db.$transaction([
      db.estimate.findMany({
        where,
        include: { items: true },
        orderBy: [
          { [query.sort === "name" ? "title" : "createdAt"]: query.direction },
          { id: "asc" },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.estimate.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        taxPercent: Number(row.taxPercent),
        items: row.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          rate: Number(item.rate),
        })),
        totals: totals(row.items, row.taxPercent),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },
  async activity(clientId: string, query: ListInput) {
    await this.get(clientId);
    const [projects, estimates] = await Promise.all([
      db.project.findMany({ where: { clientId }, select: { id: true } }),
      db.estimate.findMany({ where: { clientId }, select: { id: true } }),
    ]);
    const entityIds = [
      clientId,
      ...projects.map((p) => p.id),
      ...estimates.map((e) => e.id),
    ];
    const where = {
      entityId: { in: entityIds },
      action: { contains: query.search, mode: "insensitive" as const },
    };
    const [rows, total] = await db.$transaction([
      db.auditLog.findMany({
        where,
        select: { action: true, entityId: true, createdAt: true },
        orderBy: [
          { [query.sort === "name" ? "action" : "createdAt"]: query.direction },
          { id: "asc" },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.auditLog.count({ where }),
    ]);
    return {
      data: rows.map(({ action, createdAt }) => ({ action, createdAt })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },
  async createProject(clientId: string, input: ProjectInput, actorId: string) {
    const client = await this.get(clientId);
    if (!client.active) throw new AppError(409, "Client is inactive");
    await uniqueProject(input);
    try {
      const row = await db.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: { ...projectData(input), clientId },
        });
        await tx.auditLog.create({
          data: { actorId, action: "PROJECT_CREATED", entityId: created.id },
        });
        return created;
      });
      return projectOutput(row);
    } catch (e) {
      uniqueError(e);
    }
  },
  async getProject(id: string) {
    return projectOutput(
      present(await db.project.findUnique({ where: { id } })),
    );
  },
  async updateProject(id: string, input: ProjectInput, actorId: string) {
    const project = await this.getProject(id);
    await uniqueProject(input, id);
    try {
      await db.$transaction(async (tx) => {
        await tx.project.update({ where: { id }, data: projectData(input) });
        await tx.auditLog.create({
          data: { actorId, action: "PROJECT_UPDATED", entityId: id },
        });
      });
      return this.getProject(project.id);
    } catch (e) {
      uniqueError(e);
    }
  },
  async statusProject(
    id: string,
    status: "ACTIVE" | "ARCHIVED",
    actorId: string,
  ) {
    const project = await this.getProject(id);
    if (status === "ACTIVE" && !(await this.get(project.clientId)).active)
      throw new AppError(409, "Client is inactive");
    await db.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: { status } });
      await tx.auditLog.create({
        data: {
          actorId,
          action:
            status === "ACTIVE" ? "PROJECT_ACTIVATED" : "PROJECT_ARCHIVED",
          entityId: id,
        },
      });
    });
    return this.getProject(id);
  },
  async dashboard() {
    const [activeProjects, activeClients, totalEstimates, approved, recent] =
      await Promise.all([
        db.project.count({ where: { status: "ACTIVE" } }),
        db.client.count({ where: { active: true } }),
        db.estimate.count(),
        db.estimate.findMany({
          where: { status: "APPROVED" },
          select: moneySelect,
        }),
        db.estimate.findMany({
          take: 10,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: { items: true },
        }),
      ]);
    return {
      activeProjects,
      activeClients,
      totalEstimates,
      approvedTotalsByCurrency: sumByCurrency(approved),
      recentEstimates: recent.map((row) => ({
        id: row.id,
        number: row.number,
        clientName: row.clientName,
        projectTitle: row.title,
        estimateDate: row.estimateDate,
        createdAt: row.createdAt,
        status: row.status,
        currency: row.currency,
        grandTotal: totals(row.items, row.taxPercent).total,
      })),
    };
  },
};
