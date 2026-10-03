import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { AppError } from "../middleware/errors.js";
import type { SaveDesignerInput } from "../designer.validation.js";

export const designerRepository = {
  project(id: string) {
    return db.project.findUnique({ where: { id }, select: { id: true, status: true,
      client: { select: { active: true } } } });
  },
  model(projectId: string) {
    return db.designerModel.findUnique({ where: { projectId } });
  },
  async create(projectId: string, name: string, floorHeightMeters: number, actorId: string) {
    try {
      return await db.$transaction(async (tx) => {
        const model = await tx.designerModel.create({ data: { projectId, name, floorHeightMeters,
          createdBy: actorId, geometry: { walls: [], junctions: [] } } });
        await tx.auditLog.create({ data: { actorId, action: "DESIGNER_CREATED", entityId: model.id,
          metadata: { projectId } } });
        return model;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new AppError(409, "This project already has a 3D Designer model");
      throw error;
    }
  },
  async save(modelId: string, projectId: string, input: SaveDesignerInput, actorId: string) {
    await db.$transaction(async (tx) => {
      const updated = await tx.designerModel.updateMany({ where: { id: modelId, projectId,
        version: input.version }, data: { version: { increment: 1 }, status: "DRAFT",
        name: input.name, floorHeightMeters: input.floorHeightMeters,
        geometry: { walls: input.walls, junctions: input.junctions } } });
      if (updated.count !== 1) throw new AppError(409, "The model has changed; reload before saving");
      await tx.auditLog.create({ data: { actorId, action: "DESIGNER_SAVED", entityId: modelId,
        metadata: { projectId, wallCount: input.walls.length,
          openingCount: input.walls.reduce((sum, wall) => sum + wall.openings.length, 0) } } });
    });
  },
  async review(modelId: string, version: number, actorId: string) {
    await db.$transaction(async (tx) => {
      const changed = await tx.designerModel.updateMany({ where: { id: modelId, version },
        data: { version: { increment: 1 }, status: "REVIEWED" } });
      if (changed.count !== 1) throw new AppError(409, "The model has changed; reload before review");
      await tx.auditLog.create({ data: { actorId, action: "DESIGNER_REVIEWED", entityId: modelId } });
    });
  },
};
