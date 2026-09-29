import type { RequestHandler } from "express";
import { z } from "zod";
import { documentCategorySchema } from "../document.validation.js";
import { AppError } from "../middleware/errors.js";
import * as documentService from "../services/document.service.js";

const id = (value: unknown) => z.string().uuid().parse(value);

export const upload: RequestHandler = async (req, res) => {
  if (!req.file) throw new AppError(400, "A document file is required");
  const category = documentCategorySchema.parse(req.body.category);
  res.status(201).json(
    await documentService.uploadProjectDocument(
      id(req.params.projectId),
      category,
      req.file,
      req.user!.id,
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

export const remove: RequestHandler = async (req, res) => {
  await documentService.deleteDocument(id(req.params.id), req.user!.id);
  res.status(204).send();
};
