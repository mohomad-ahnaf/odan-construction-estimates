import type { DocumentCategory } from "@prisma/client";
import { db } from "../db.js";

const documentInclude = {
  uploader: { select: { id: true, name: true, email: true } },
  project: {
    select: { id: true, projectCode: true, projectName: true, clientId: true },
  },
} as const;

export const documentRepository = {
  findProject(id: string) {
    return db.project.findUnique({
      where: { id },
      select: { id: true, projectCode: true, projectName: true },
    });
  },
  listForProject(projectId: string) {
    return db.document.findMany({
      where: { projectId },
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
  async create(
    input: {
      projectId: string;
      uploadedBy: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      category: DocumentCategory;
      googleDriveFileId: string;
      googleDriveFolderId: string;
    },
  ) {
    return db.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: input,
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
          },
        },
      });
      return document;
    });
  },
  async remove(id: string, actorId: string, projectId: string) {
    return db.$transaction(async (tx) => {
      await tx.document.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "DOCUMENT_DELETED",
          entityId: id,
          metadata: { projectId },
        },
      });
    });
  },
};
