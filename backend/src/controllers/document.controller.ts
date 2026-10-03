import type { RequestHandler } from "express";
import { z } from "zod";
import {
  documentCategorySchema,
  approvalCommentSchema,
  rejectionCommentSchema,
  revisionNoteSchema,
  documentMetadataSchema,
  uploadMetadataSchema,
} from "../document.validation.js";
import { AppError } from "../middleware/errors.js";
import * as documentService from "../services/document.service.js";

const id = (value: unknown) => z.string().uuid().parse(value);

function inlineDisposition(fileName: string) {
  const safeName = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 180) || "document";
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${safeName}"; filename*=UTF-8''${encoded}`;
}

export const upload: RequestHandler = async (req, res) => {
  if (!req.file) throw new AppError(400, "A document file is required");
  const category = documentCategorySchema.parse(req.body.category);
  const revisionNote = revisionNoteSchema.parse(req.body.revisionNote);
  const metadata = uploadMetadataSchema.parse({ title: req.body.title, description: req.body.description });
  res.status(201).json(
    await documentService.uploadProjectDocument(
      id(req.params.projectId),
      category,
      req.file,
      req.user!.id,
      revisionNote,
      metadata,
    ),
  );
};

export const listForProject: RequestHandler = async (req, res) => {
  res.json(
    await documentService.listProjectDocuments(id(req.params.projectId)),
  );
};

export const get: RequestHandler = async (req, res) => {
  res.json(await documentService.getDocument(id(req.params.id)));
};

export const content: RequestHandler = async (req, res, next) => {
  const file = await documentService.getDocumentContent(id(req.params.id));
  res.setHeader("Content-Type", file.fileType);
  res.setHeader("Content-Disposition", inlineDisposition(file.fileName));
  res.setHeader("Content-Length", String(file.fileSize));
  res.setHeader("X-Content-Type-Options", "nosniff");
  file.stream.once("error", (error) => {
    if (res.headersSent) res.destroy(error);
    else next(error);
  });
  file.stream.pipe(res);
};

export const versions: RequestHandler = async (req, res) => {
  res.json(await documentService.getDocumentVersions(id(req.params.id)));
};

export const updateMetadata: RequestHandler = async (req, res) => {
  res.json(await documentService.updateDocumentMetadata(id(req.params.id),
    documentMetadataSchema.parse(req.body), req.user!.id));
};

export const removePhotoHistory: RequestHandler = async (req, res) => {
  await documentService.deletePhotoHistory(id(req.params.id), req.user!.id);
  res.status(204).send();
};

export const revision: RequestHandler = async (req, res) => {
  if (!req.file) throw new AppError(400, "A document file is required");
  res.status(201).json(
    await documentService.uploadDocumentRevision(
      id(req.params.id),
      req.file,
      req.user!.id,
      revisionNoteSchema.parse(req.body.revisionNote),
    ),
  );
};

export const submit: RequestHandler = async (req, res) => {
  const { comment } = approvalCommentSchema.parse(req.body);
  res.json(
    await documentService.submitDocument(
      id(req.params.id),
      req.user!.id,
      comment ?? null,
    ),
  );
};

export const approve: RequestHandler = async (req, res) => {
  const { comment } = approvalCommentSchema.parse(req.body);
  res.json(
    await documentService.approveDocument(
      id(req.params.id),
      req.user!.id,
      comment ?? null,
    ),
  );
};

export const reject: RequestHandler = async (req, res) => {
  const { comment } = rejectionCommentSchema.parse(req.body);
  res.json(
    await documentService.rejectDocument(
      id(req.params.id),
      req.user!.id,
      comment,
    ),
  );
};

export const approvalHistory: RequestHandler = async (req, res) => {
  res.json(
    await documentService.getDocumentApprovalHistory(id(req.params.id)),
  );
};

export const remove: RequestHandler = async (req, res) => {
  await documentService.deleteDocument(id(req.params.id), req.user!.id);
  res.status(204).send();
};
