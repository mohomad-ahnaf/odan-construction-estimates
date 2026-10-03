import type {
  DocumentApprovalAction,
  DocumentCategory,
  DocumentStatus,
} from "@prisma/client";
import { db } from "../db.js";
import { AppError } from "../middleware/errors.js";

const documentInclude = {
  uploader: { select: { id: true, name: true, email: true } },
  project: {
    select: { id: true, projectCode: true, projectName: true, clientId: true },
  },
} as const;

type DocumentWrite = {
  id: string;
  projectId: string;
  uploadedBy: string;
  fileName: string;
  title?: string | null;
  description?: string | null;
  fileType: string;
  fileSize: number;
  category: DocumentCategory;
  googleDriveFileId: string;
  googleDriveFolderId: string;
  revisionNote: string | null;
};

export const documentRepository = {
  findProject(id: string) {
    return db.project.findUnique({
      where: { id },
      select: { id: true, projectCode: true, projectName: true },
    });
  },
  findLatestByCombination(
    projectId: string,
    category: DocumentCategory,
    fileName: string,
  ) {
    return db.document.findFirst({
      where: { projectId, category, fileName, isLatest: true },
      include: documentInclude,
    });
  },
  listForProject(projectId: string) {
    return db.document.findMany({
      where: { projectId, isLatest: true },
      include: documentInclude,
      orderBy: { createdAt: "desc" },
    });
  },
  get(id: string) {
    return db.document.findUnique({
      where: { id },
      include: documentInclude,
    });
  },
  history(versionGroupId: string) {
    return db.document.findMany({
      where: { versionGroupId },
      include: documentInclude,
      orderBy: { version: "desc" },
    });
  },
  async updateMetadata(id: string, title: string | null | undefined,
    description: string | null | undefined, actorId: string) {
    return db.$transaction(async (tx) => {
      const changed = await tx.document.updateMany({
        where: { id, isLatest: true, status: { not: "APPROVED" } },
        data: { ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}) },
      });
      if (changed.count !== 1) throw new AppError(409, "Photo revision changed; refresh and try again");
      await tx.auditLog.create({ data: { actorId, action: "DOCUMENT_METADATA_UPDATED", entityId: id,
        metadata: { fields: [title !== undefined ? "title" : null,
          description !== undefined ? "description" : null].filter(Boolean) } } });
      return tx.document.findUniqueOrThrow({ where: { id }, include: documentInclude });
    });
  },
  async removeVersionGroup(versionGroupId: string, expectedIds: string[], actorId: string) {
    return db.$transaction(async (tx) => {
      const records = await tx.document.findMany({ where: { versionGroupId },
        select: { id: true, projectId: true, category: true, status: true } });
      const actualIds = records.map((record) => record.id).sort();
      const requiredIds = [...expectedIds].sort();
      if (actualIds.length !== expectedIds.length ||
          actualIds.some((id, index) => id !== requiredIds[index]))
        throw new AppError(409, "Photo history changed; refresh and try again");
      if (records.some((record) => record.category !== "IMAGES" || record.status === "APPROVED"))
        throw new AppError(409, "Approved photos cannot be deleted");
      const removed = await tx.document.deleteMany({ where: { versionGroupId, id: { in: expectedIds } } });
      if (removed.count !== expectedIds.length)
        throw new AppError(409, "Photo history changed; refresh and try again");
      await tx.auditLog.create({ data: { actorId, action: "SITE_PHOTO_DELETED",
        entityId: versionGroupId, metadata: { projectId: records[0]!.projectId, versions: records.length } } });
    }, { isolationLevel: "Serializable" });
  },
  approvalHistory(documentId: string) {
    return db.documentApproval.findMany({
      where: { documentId },
      include: {
        approver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },
  async transition(
    id: string,
    actorId: string,
    expected: DocumentStatus,
    status: DocumentStatus,
    action: DocumentApprovalAction,
    comment: string | null,
  ) {
    return db.$transaction(async (tx) => {
      const changed = await tx.document.updateMany({
        where: { id, status: expected, isLatest: true },
        data: { status },
      });
      if (changed.count !== 1)
        throw new AppError(409, "Document approval state has changed");
      await tx.documentApproval.create({
        data: { documentId: id, action, comment, approvedBy: actorId },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: `DOCUMENT_${action}`,
          entityId: id,
          metadata: { status },
        },
      });
      return tx.document.findUniqueOrThrow({
        where: { id },
        include: documentInclude,
      });
    });
  },
  async createInitial(input: DocumentWrite) {
    return db.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          ...input,
          version: 1,
          isLatest: true,
          versionGroupId: input.id,
        },
        include: documentInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: input.uploadedBy,
          action: "DOCUMENT_UPLOADED",
          entityId: document.id,
          metadata: {
            projectId: input.projectId,
            category: input.category,
            version: 1,
          },
        },
      });
      return document;
    });
  },
  async createRevision(baseId: string, input: DocumentWrite) {
    return db.$transaction(async (tx) => {
      const base = await tx.document.findUniqueOrThrow({ where: { id: baseId } });
      const latest = await tx.document.aggregate({
        where: { versionGroupId: base.versionGroupId },
        _max: { version: true },
      });
      const version = (latest._max.version ?? 0) + 1;
      const latestRecord = await tx.document.findFirstOrThrow({
        where: { versionGroupId: base.versionGroupId, isLatest: true },
      });
      await tx.document.updateMany({
        where: { versionGroupId: base.versionGroupId, isLatest: true },
        data: { isLatest: false },
      });
      const document = await tx.document.create({
        data: {
          ...input,
          title: input.title === undefined ? latestRecord.title : input.title,
          description: input.description === undefined ? latestRecord.description : input.description,
          projectId: base.projectId,
          category: base.category,
          versionGroupId: base.versionGroupId,
          version,
          isLatest: true,
        },
        include: documentInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: input.uploadedBy,
          action: "DOCUMENT_REVISION_UPLOADED",
          entityId: document.id,
          metadata: {
            projectId: base.projectId,
            previousDocumentId: baseId,
            version,
          },
        },
      });
      return document;
    });
  },
  async remove(id: string, actorId: string) {
    return db.$transaction(async (tx) => {
      const target = await tx.document.findUniqueOrThrow({ where: { id } });
      await tx.document.delete({ where: { id } });
      if (target.isLatest) {
        const previous = await tx.document.findFirst({
          where: { versionGroupId: target.versionGroupId },
          orderBy: { version: "desc" },
        });
        if (previous)
          await tx.document.update({
            where: { id: previous.id },
            data: { isLatest: true },
          });
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: "DOCUMENT_DELETED",
          entityId: id,
          metadata: { projectId: target.projectId, version: target.version },
        },
      });
    });
  },
};
