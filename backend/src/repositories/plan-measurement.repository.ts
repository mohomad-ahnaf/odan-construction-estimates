import { Prisma, type MeasurementType } from "@prisma/client";
import { db } from "../db.js";
import { AppError } from "../middleware/errors.js";
import type { DeleteMeasurementGroupInput } from "../plan-measurement.validation.js";

const measurementInclude = {
  creator: { select: { id: true, name: true } },
  document: { select: { id: true, version: true, fileName: true, projectId: true } },
  group: { select: { id: true, name: true, documentId: true } },
} as const;

const groupInclude = {
  creator: { select: { id: true, name: true } },
  _count: { select: { measurements: true } },
} as const;

function groupNameConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    throw new AppError(409, "A measurement group with this name already exists for the drawing revision");
  throw error;
}

export const planMeasurementRepository = {
  findProject(id: string) {
    return db.project.findUnique({ where: { id }, select: { id: true } });
  },
  listPlanDocuments(projectId: string) {
    return db.document.findMany({
      where: {
        projectId,
        category: "DRAWINGS",
        fileType: { in: ["application/pdf", "image/png", "image/jpeg"] },
      },
      include: { uploader: { select: { id: true, name: true, email: true } } },
      orderBy: [{ fileName: "asc" }, { version: "desc" }],
    });
  },
  getDocument(id: string) {
    return db.document.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        category: true,
        fileName: true,
        fileType: true,
        version: true,
        status: true,
      },
    });
  },
  getCalibration(documentId: string, pageNumber: number) {
    return db.pageCalibration.findUnique({
      where: { documentId_pageNumber: { documentId, pageNumber } },
    });
  },
  listMeasurements(documentId: string, pageNumber: number) {
    return db.planMeasurement.findMany({
      where: { documentId, pageNumber },
      include: measurementInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  },
  listProjectMeasurements(projectId: string) {
    return db.planMeasurement.findMany({
      where: { document: { projectId } },
      include: measurementInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  },
  getMeasurement(id: string) {
    return db.planMeasurement.findUnique({ where: { id }, include: measurementInclude });
  },
  listGroups(documentId: string) {
    return db.planMeasurementGroup.findMany({
      where: { documentId },
      include: groupInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  },
  getGroup(id: string) {
    return db.planMeasurementGroup.findUnique({
      where: { id },
      include: {
        ...groupInclude,
        document: { select: { id: true, projectId: true } },
      },
    });
  },
  async createGroup(input: { documentId: string; name: string; actorId: string }) {
    try {
      return await db.$transaction(async (tx) => {
        const group = await tx.planMeasurementGroup.create({
          data: { documentId: input.documentId, name: input.name, createdBy: input.actorId },
          include: groupInclude,
        });
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            action: "PLAN_MEASUREMENT_GROUP_CREATED",
            entityId: group.id,
            metadata: { documentId: input.documentId },
          },
        });
        return group;
      });
    } catch (error) {
      groupNameConflict(error);
    }
  },
  async renameGroup(id: string, version: number, name: string, actorId: string) {
    try {
      return await db.$transaction(async (tx) => {
        const changed = await tx.planMeasurementGroup.updateMany({
          where: { id, version },
          data: { name, version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new AppError(409, "Measurement group has changed; reload before saving");
        const group = await tx.planMeasurementGroup.findUniqueOrThrow({
          where: { id },
          include: groupInclude,
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "PLAN_MEASUREMENT_GROUP_RENAMED",
            entityId: id,
            metadata: { documentId: group.documentId },
          },
        });
        return group;
      });
    } catch (error) {
      groupNameConflict(error);
    }
  },
  async deleteGroup(id: string, input: DeleteMeasurementGroupInput, actorId: string) {
    return db.$transaction(async (tx) => {
      const reserved = await tx.planMeasurementGroup.updateMany({
        where: { id, version: input.version },
        data: { version: { increment: 1 } },
      });
      if (reserved.count !== 1)
        throw new AppError(409, "Measurement group has changed; reload before deleting");
      const group = await tx.planMeasurementGroup.findUnique({
        where: { id },
        include: { _count: { select: { measurements: true } } },
      });
      if (!group) throw new AppError(404, "Measurement group not found");
      if (group._count.measurements > 0 && !input.destinationGroupId && !input.newGroupName)
        throw new AppError(409, "Move all measurements to another group before deleting this group");
      let destinationId: string | null = null;
      if (input.destinationGroupId) {
        if (input.destinationGroupId === id)
          throw new AppError(409, "Choose another measurement group");
        const destination = await tx.planMeasurementGroup.findUnique({ where: { id: input.destinationGroupId } });
        if (!destination || destination.documentId !== group.documentId)
          throw new AppError(409, "Destination group must belong to the same drawing revision");
        destinationId = destination.id;
      } else if (input.newGroupName) {
        try {
          const destination = await tx.planMeasurementGroup.create({
            data: { documentId: group.documentId, name: input.newGroupName, createdBy: actorId },
          });
          destinationId = destination.id;
        } catch (error) {
          groupNameConflict(error);
        }
        await tx.auditLog.create({
          data: {
            actorId,
            action: "PLAN_MEASUREMENT_GROUP_CREATED",
            entityId: destinationId,
            metadata: { documentId: group.documentId },
          },
        });
      }
      let movedCount = 0;
      if (destinationId) {
        const moved = await tx.planMeasurement.updateMany({
          where: { groupId: id, documentId: group.documentId },
          data: { groupId: destinationId, version: { increment: 1 } },
        });
        movedCount = moved.count;
        if (movedCount !== group._count.measurements)
          throw new AppError(409, "Measurements changed; reload before deleting this group");
      }
      const removed = await tx.planMeasurementGroup.deleteMany({ where: { id, version: input.version + 1 } });
      if (removed.count !== 1)
        throw new AppError(409, "Measurement group has changed; reload before deleting");
      await tx.auditLog.create({
        data: {
          actorId,
          action: "PLAN_MEASUREMENT_GROUP_DELETED",
          entityId: id,
          metadata: { documentId: group.documentId, destinationGroupId: destinationId, movedCount },
        },
      });
      if (destinationId && movedCount > 0) await tx.auditLog.create({
        data: {
          actorId,
          action: "PLAN_MEASUREMENTS_MOVED",
          entityId: destinationId,
          metadata: { documentId: group.documentId, sourceGroupId: id, movedCount },
        },
      });
      return { destinationGroupId: destinationId, movedCount };
    });
  },
  async saveCalibration(input: {
    documentId: string;
    pageNumber: number;
    pageWidth: number;
    pageHeight: number;
    referenceGeometry: Prisma.InputJsonValue;
    referenceLengthMeters: string;
    referenceUnit: string;
    checkReferenceGeometry?: Prisma.InputJsonValue;
    checkReferenceLengthMeters?: string;
    actorId: string;
    version?: number;
    measurementQuantities: { id: string; quantity: string }[];
  }) {
    return db.$transaction(async (tx) => {
      const existing = await tx.pageCalibration.findUnique({
        where: {
          documentId_pageNumber: {
            documentId: input.documentId,
            pageNumber: input.pageNumber,
          },
        },
      });
      let calibration;
      if (existing) {
        if (!input.version || input.version !== existing.version)
          throw new AppError(409, "Calibration has changed; reload before saving");
        const changed = await tx.pageCalibration.updateMany({
          where: { id: existing.id, version: input.version },
          data: {
            pageWidth: input.pageWidth,
            pageHeight: input.pageHeight,
            referenceGeometry: input.referenceGeometry,
            referenceLengthMeters: input.referenceLengthMeters,
            referenceUnit: input.referenceUnit,
            checkReferenceGeometry: input.checkReferenceGeometry ?? Prisma.DbNull,
            checkReferenceLengthMeters: input.checkReferenceLengthMeters ?? null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new AppError(409, "Calibration has changed; reload before saving");
        calibration = await tx.pageCalibration.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        if (input.version)
          throw new AppError(409, "Calibration no longer exists; reload before saving");
        calibration = await tx.pageCalibration.create({
          data: {
            documentId: input.documentId,
            pageNumber: input.pageNumber,
            pageWidth: input.pageWidth,
            pageHeight: input.pageHeight,
            referenceGeometry: input.referenceGeometry,
            referenceLengthMeters: input.referenceLengthMeters,
            referenceUnit: input.referenceUnit,
            checkReferenceGeometry: input.checkReferenceGeometry,
            checkReferenceLengthMeters: input.checkReferenceLengthMeters,
            createdBy: input.actorId,
          },
        });
      }
      for (const measurement of input.measurementQuantities)
        await tx.planMeasurement.updateMany({
          where: {
            id: measurement.id,
            documentId: input.documentId,
            pageNumber: input.pageNumber,
          },
          data: {
            quantity: measurement.quantity,
            confirmed: false,
            version: { increment: 1 },
          },
        });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: existing ? "PLAN_CALIBRATION_UPDATED" : "PLAN_CALIBRATION_CREATED",
          entityId: calibration.id,
          metadata: { documentId: input.documentId, pageNumber: input.pageNumber },
        },
      });
      return calibration;
    });
  },
  async createMeasurement(input: {
    documentId: string;
    groupId: string;
    pageNumber: number;
    pageWidth: number;
    pageHeight: number;
    type: MeasurementType;
    label: string;
    geometry: Prisma.InputJsonValue;
    quantity: string;
    unit: string;
    actorId: string;
  }) {
    return db.$transaction(async (tx) => {
      const { actorId, ...measurementData } = input;
      const measurement = await tx.planMeasurement.create({
        data: { ...measurementData, createdBy: actorId },
        include: measurementInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "PLAN_MEASUREMENT_CREATED",
          entityId: measurement.id,
          metadata: { documentId: input.documentId, groupId: input.groupId, pageNumber: input.pageNumber, type: input.type },
        },
      });
      return measurement;
    });
  },
  async updateMeasurement(
    id: string,
    version: number,
    data: {
      label?: string;
      groupId?: string;
      geometry?: Prisma.InputJsonValue;
      quantity?: string;
      unit?: string;
      confirmed?: boolean;
    },
    actorId: string,
  ) {
    return db.$transaction(async (tx) => {
      const changed = await tx.planMeasurement.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new AppError(409, "Measurement has changed; reload before saving");
      const measurement = await tx.planMeasurement.findUniqueOrThrow({
        where: { id },
        include: measurementInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: data.groupId
            ? "PLAN_MEASUREMENT_MOVED"
            : data.confirmed ? "PLAN_MEASUREMENT_CONFIRMED" : "PLAN_MEASUREMENT_UPDATED",
          entityId: id,
          metadata: { documentId: measurement.documentId, pageNumber: measurement.pageNumber, groupId: measurement.groupId },
        },
      });
      return measurement;
    });
  },
  async deleteMeasurement(id: string, version: number, actorId: string) {
    return db.$transaction(async (tx) => {
      const target = await tx.planMeasurement.findUnique({ where: { id } });
      if (!target) throw new AppError(404, "Measurement not found");
      const removed = await tx.planMeasurement.deleteMany({ where: { id, version } });
      if (removed.count !== 1)
        throw new AppError(409, "Measurement has changed; reload before deleting");
      await tx.auditLog.create({
        data: {
          actorId,
          action: "PLAN_MEASUREMENT_DELETED",
          entityId: id,
          metadata: { documentId: target.documentId, pageNumber: target.pageNumber },
        },
      });
    });
  },
};
