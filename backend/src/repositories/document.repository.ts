import type { DocumentCategory } from "@prisma/client";
import { db } from "../db.js";

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
      await tx.document.updateMany({
        where: { versionGroupId: base.versionGroupId, isLatest: true },
        data: { isLatest: false },
      });
      const document = await tx.document.create({
        data: {
          ...input,
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
