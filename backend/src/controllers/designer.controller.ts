import type { RequestHandler } from "express";
import { z } from "zod";
import { createDesignerSchema, reviewDesignerSchema, saveDesignerSchema } from "../designer.validation.js";
import * as service from "../services/designer.service.js";

const projectId = (value: unknown) => z.string().uuid().parse(value);
export const get: RequestHandler = async (req, res) => {
  res.json(await service.getDesigner(projectId(req.params.projectId)));
};
export const create: RequestHandler = async (req, res) => {
  res.status(201).json(await service.createDesigner(projectId(req.params.projectId),
    createDesignerSchema.parse(req.body), req.user!.id));
};
export const save: RequestHandler = async (req, res) => {
  res.json(await service.saveDesigner(projectId(req.params.projectId),
    saveDesignerSchema.parse(req.body), req.user!.id));
};
export const review: RequestHandler = async (req, res) => {
  res.json(await service.reviewDesigner(projectId(req.params.projectId),
    reviewDesignerSchema.parse(req.body).version, req.user!.id));
};
