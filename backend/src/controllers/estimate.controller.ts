import type { RequestHandler } from "express";
import { z } from "zod";
import {
  estimateSchema,
  projectEstimateSchema,
  updateSchema,
  statusSchema,
} from "../validation.js";
import * as service from "../services/estimate.service.js";
import * as exports from "../services/export.service.js";
import { estimateRepository } from "../repositories/estimate.repository.js";
const id = (value: unknown) => z.string().uuid().parse(value);
export const list: RequestHandler = async (req, res) => {
  const query = z
    .object({
      search: z.string().max(160).default(""),
      page: z.coerce.number().int().positive().max(100000).default(1),
    })
    .parse(req.query);
  res.json(await service.listEstimates(query.search, query.page));
};
export const listForProject: RequestHandler = async (req, res) => {
  const query = z
    .object({
      search: z.string().trim().max(160).default(""),
      page: z.coerce.number().int().positive().max(100000).default(1),
    })
    .strict()
    .parse(req.query);
  res.json(
    await service.listProjectEstimates(
      id(req.params.projectId),
      query.search,
      query.page,
    ),
  );
};
export const createForProject: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json(
      await service.createProjectEstimate(
        id(req.params.projectId),
        projectEstimateSchema.parse(req.body),
        req.user!.id,
      ),
    );
};
export const get: RequestHandler = async (req, res) => {
  res.json(service.serialize(await service.getEstimate(id(req.params.id))));
};
export const create: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json(
      await service.createEstimate(
        estimateSchema.parse(req.body),
        req.user!.id,
      ),
    );
};
export const update: RequestHandler = async (req, res) => {
  const { version, ...input } = updateSchema.parse(req.body);
  res.json(
    await service.updateEstimate(
      id(req.params.id),
      input,
      version,
      req.user!.id,
    ),
  );
};
export const status: RequestHandler = async (req, res) => {
  const input = statusSchema.parse(req.body);
  res.json(
    await service.changeStatus(
      id(req.params.id),
      input.status,
      input.version,
      req.user!.id,
      req.user!.role,
    ),
  );
};
export const download: RequestHandler = async (req, res) => {
  const format = z.enum(["pdf", "xlsx"]).parse(req.params.format);
  const estimate = await service.getEstimate(id(req.params.id));
  const buffer = await exports[format](estimate);
  await estimateRepository.audit(
    req.user!.id,
    `EXPORT_${format.toUpperCase()}`,
    estimate.id,
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${estimate.number}.${format}"`,
  );
  res
    .type(
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    .send(buffer);
};
export const audit: RequestHandler = async (_req, res) => {
  res.json(await estimateRepository.auditList());
};
