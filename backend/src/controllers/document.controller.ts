import type { RequestHandler } from "express";
import { z } from "zod";
import {
  documentCategorySchema,
  revisionNoteSchema,
} from "../document.validation.js";
import { AppError } from "../middleware/errors.js";
import * as documentService from "../services/document.service.js";

const id = (value: unknown) => z.string().uuid().parse(value);

export const upload: RequestHandler = async (req, res) => {
  if (!req.file) throw new AppError(400, "A document file is required");
  const category = documentCategorySchema.parse(req.body.category);
  const revisionNote = revisionNoteSchema.parse(req.body.revisionNote);
  res.status(201).json(
    await documentService.uploadProjectDocument(
      id(req.params.projectId),
      category,
      req.file,
      req.user!.id,
      revisionNote,
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

export const versions: RequestHandler = async (req, res) => {
  res.json(await documentService.getDocumentVersions(id(req.params.id)));
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

export const remove: RequestHandler = async (req, res) => {
  await documentService.deleteDocument(id(req.params.id), req.user!.id);
  res.status(204).send();
};
