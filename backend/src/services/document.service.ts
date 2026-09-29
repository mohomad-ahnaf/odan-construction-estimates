import path from "node:path";
import type { DocumentCategory } from "@prisma/client";
import { AppError } from "../middleware/errors.js";
import { maximumDocumentBytes } from "../middleware/document-upload.js";
import { documentRepository } from "../repositories/document.repository.js";
import {
  deleteDriveFile,
  ensureProjectDriveFolders,
  generateDriveLinks,
  getAuthenticatedDriveClient,
  getDriveFileMetadata,
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
  const uploaded = await uploadDriveFile(drive, {
    folderId,
    fileName: validated.fileName,
    mimeType: validated.mimeType,
    buffer: file.buffer,
  });

  try {
    const document = await documentRepository.create({
      projectId,
      uploadedBy: actorId,
      fileName: validated.fileName,
      fileType: validated.mimeType,
      fileSize: file.size,
      category,
      googleDriveFileId: uploaded.id!,
      googleDriveFolderId: folderId,
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

export async function deleteDocument(id: string, actorId: string) {
  const document = await documentRepository.get(id);
  if (!document) throw new AppError(404, "Document not found");
  const drive = await getAuthenticatedDriveClient();
  await deleteDriveFile(drive, document.googleDriveFileId);
  await documentRepository.remove(id, actorId, document.projectId);
}
