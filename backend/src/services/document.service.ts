import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DocumentApprovalAction,
  DocumentCategory,
  DocumentStatus,
} from "@prisma/client";
import { AppError } from "../middleware/errors.js";
import { logger } from "../logger.js";
import { maximumDocumentBytes } from "../middleware/document-upload.js";
import { documentRepository } from "../repositories/document.repository.js";
import {
  deleteDriveFile,
  ensureProjectDriveFolders,
  generateDriveLinks,
  getAuthenticatedDriveClient,
  getDriveFileContent,
  getDriveFileMetadata,
  setDriveFileTrashed,
  uploadDriveFile,
  type DriveFolderName,
} from "./google-drive.service.js";

const allowedFiles = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
} as const;

const categoryFolders: Record<DocumentCategory, DriveFolderName> = {
  DRAWINGS: "Drawings",
  IMAGES: "Images",
  CONTRACTS: "Contracts",
  BOQ: "BOQ",
  REPORTS: "Reports",
  OTHER: "Other",
};

type DisplayMetadata = { title?: string | null; description?: string | null };

export function validateDocumentFile(file: Express.Multer.File) {
  if (!file.size || file.size > maximumDocumentBytes)
    throw new AppError(413, "File exceeds the 25 MB limit");
  const fileName = path
    .basename(file.originalname.replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  if (!fileName) throw new AppError(400, "A valid file name is required");
  const extension = path.extname(fileName).toLowerCase() as keyof typeof allowedFiles;
  const expectedMime = allowedFiles[extension];
  if (!expectedMime || file.mimetype.toLowerCase() !== expectedMime)
    throw new AppError(400, "Unsupported document type");
  return { fileName, mimeType: expectedMime };
}

function serializeDocument<T extends { googleDriveFileId: string }>(record: T) {
  return { ...record, links: generateDriveLinks(record.googleDriveFileId) };
}

export async function uploadProjectDocument(
  projectId: string,
  category: DocumentCategory,
  file: Express.Multer.File,
  actorId: string,
  revisionNote: string | null = null,
  metadata: DisplayMetadata = {},
) {
  const validated = validateDocumentFile(file);
  const project = await documentRepository.findProject(projectId);
  if (!project) throw new AppError(404, "Project not found");
  if (!project.projectCode)
    throw new AppError(409, "Project code is required before uploading documents");

  const drive = await getAuthenticatedDriveClient();
  const folders = await ensureProjectDriveFolders(
    drive,
    project.projectCode,
    project.projectName,
  );
  const folderId = folders.categories[categoryFolders[category]];
  const existing = await documentRepository.findLatestByCombination(
    projectId,
    category,
    validated.fileName,
  );
  const uploaded = await uploadDriveFile(drive, {
    folderId,
    fileName: validated.fileName,
    mimeType: validated.mimeType,
    buffer: file.buffer,
  });

  try {
    const input = {
      id: randomUUID(),
      projectId,
      uploadedBy: actorId,
      fileName: validated.fileName,
      ...metadata,
      fileType: validated.mimeType,
      fileSize: file.size,
      category,
      googleDriveFileId: uploaded.id!,
      googleDriveFolderId: folderId,
      revisionNote,
    };
    const document = existing
      ? await documentRepository.createRevision(existing.id, input)
      : await documentRepository.createInitial(input);
    return serializeDocument(document);
  } catch (error) {
    await deleteDriveFile(drive, uploaded.id!).catch(() => undefined);
    throw error;
  }
}

export async function uploadDocumentRevision(
  documentId: string,
  file: Express.Multer.File,
  actorId: string,
  revisionNote: string | null,
) {
  const validated = validateDocumentFile(file);
  const base = await documentRepository.get(documentId);
  if (!base) throw new AppError(404, "Document not found");
  const drive = await getAuthenticatedDriveClient();
  const uploaded = await uploadDriveFile(drive, {
    folderId: base.googleDriveFolderId,
    fileName: validated.fileName,
    mimeType: validated.mimeType,
    buffer: file.buffer,
  });
  try {
    const document = await documentRepository.createRevision(documentId, {
      id: randomUUID(),
      projectId: base.projectId,
      uploadedBy: actorId,
      fileName: validated.fileName,
      fileType: validated.mimeType,
      fileSize: file.size,
      category: base.category,
      googleDriveFileId: uploaded.id!,
      googleDriveFolderId: base.googleDriveFolderId,
      revisionNote,
    });
    return serializeDocument(document);
  } catch (error) {
    await deleteDriveFile(drive, uploaded.id!).catch(() => undefined);
    throw error;
  }
}

export async function listProjectDocuments(projectId: string) {
  if (!(await documentRepository.findProject(projectId)))
    throw new AppError(404, "Project not found");
  return (await documentRepository.listForProject(projectId)).map(
    serializeDocument,
  );
}

export async function getDocument(id: string) {
  const document = await documentRepository.get(id);
  if (!document) throw new AppError(404, "Document not found");
  const drive = await getAuthenticatedDriveClient();
  const driveMetadata = await getDriveFileMetadata(
    drive,
    document.googleDriveFileId,
  );
  return { ...serializeDocument(document), driveMetadata };
}

export async function getDocumentContent(id: string) {
  const document = await documentRepository.get(id);
  if (!document) throw new AppError(404, "Document not found");
  const drive = await getAuthenticatedDriveClient();
  const stream = await getDriveFileContent(drive, document.googleDriveFileId);
  return {
    stream,
    fileName: document.fileName,
    fileType: document.fileType,
    fileSize: document.fileSize,
  };
}

export async function getDocumentVersions(id: string) {
  const document = await documentRepository.get(id);
  if (!document) throw new AppError(404, "Document not found");
  return (await documentRepository.history(document.versionGroupId)).map(
    serializeDocument,
  );
}

export async function updateDocumentMetadata(id: string, metadata: DisplayMetadata, actorId: string) {
  const document = await documentRepository.get(id);
  if (!document) throw new AppError(404, "Document not found");
  if (!document.isLatest) throw new AppError(409, "Only the latest revision can be edited");
  if (document.status === "APPROVED") throw new AppError(409, "Approved photo details cannot be edited");
  return serializeDocument(await documentRepository.updateMetadata(id,
    metadata.title === "" ? null : metadata.title,
    metadata.description === "" ? null : metadata.description, actorId));
}

export async function deletePhotoHistory(id: string, actorId: string) {
  const document = await documentRepository.get(id);
  if (!document || document.category !== "IMAGES") throw new AppError(404, "Photo not found");
  const versions = await documentRepository.history(document.versionGroupId);
  if (versions.some((version) => version.status === "APPROVED"))
    throw new AppError(409, "Approved photos cannot be deleted");
  const drive = await getAuthenticatedDriveClient();
  const staged: string[] = [];
  try {
    for (const version of versions) {
      if (await setDriveFileTrashed(drive, version.googleDriveFileId, true))
        staged.push(version.googleDriveFileId);
    }
    await documentRepository.removeVersionGroup(document.versionGroupId,
      versions.map((version) => version.id), actorId);
  } catch (error) {
    const restored = await Promise.allSettled(staged.map((fileId) =>
      setDriveFileTrashed(drive, fileId, false)));
    if (restored.some((result) => result.status === "rejected"))
      logger.error({ documentId: id }, "Photo deletion rollback needs Drive recovery");
    throw error;
  }
  for (const fileId of staged) {
    try { await deleteDriveFile(drive, fileId); }
    catch { logger.warn({ documentId: id, fileId }, "Trashed photo file awaits permanent deletion"); }
  }
}

async function transitionDocument(
  id: string,
  actorId: string,
  expected: DocumentStatus,
  status: DocumentStatus,
  action: DocumentApprovalAction,
  comment: string | null,
) {
  const document = await documentRepository.get(id);
  if (!document) throw new AppError(404, "Document not found");
  if (!document.isLatest)
    throw new AppError(409, "Only the latest document version can be reviewed");
  if (document.status !== expected)
    throw new AppError(409, `Document must be ${expected.toLowerCase().replace("_", " ")}`);
  return serializeDocument(
    await documentRepository.transition(
      id,
      actorId,
      expected,
      status,
      action,
      comment,
    ),
  );
}

export function submitDocument(
  id: string,
  actorId: string,
  comment: string | null,
) {
  return transitionDocument(
    id,
    actorId,
    "DRAFT",
    "PENDING_REVIEW",
    "SUBMITTED",
    comment,
  );
}

export function approveDocument(
  id: string,
  actorId: string,
  comment: string | null,
) {
  return transitionDocument(
    id,
    actorId,
    "PENDING_REVIEW",
    "APPROVED",
    "APPROVED",
    comment,
  );
}

export function rejectDocument(id: string, actorId: string, comment: string) {
  return transitionDocument(
    id,
    actorId,
    "PENDING_REVIEW",
    "REJECTED",
    "REJECTED",
    comment,
  );
}

export async function getDocumentApprovalHistory(id: string) {
  if (!(await documentRepository.get(id)))
    throw new AppError(404, "Document not found");
  return documentRepository.approvalHistory(id);
}

export async function deleteDocument(id: string, actorId: string) {
  const document = await documentRepository.get(id);
  if (!document) throw new AppError(404, "Document not found");
  if (document.status === "APPROVED")
    throw new AppError(409, "Approved documents cannot be deleted");
  const drive = await getAuthenticatedDriveClient();
  await deleteDriveFile(drive, document.googleDriveFileId);
  await documentRepository.remove(id, actorId);
}
