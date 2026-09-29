import type { RequestHandler } from "express";
import { z } from "zod";
import {
  clientEstimateSchema,
  clientEstimateStatusSchema,
  clientEstimateUpdateSchema,
} from "../client-estimate.validation.js";
import * as service from "../services/client-estimate.service.js";
import { clientEstimateRepository } from "../repositories/client-estimate.repository.js";
import {
  clientEstimateExcel,
  clientEstimatePdf,
} from "../services/client-estimate-export.service.js";

const id = (value: unknown) => z.string().uuid().parse(value);

export const listForProject: RequestHandler = async (req, res) => {
  const { page } = z
    .object({ page: z.coerce.number().int().positive().max(100000).default(1) })
    .strict()
    .parse(req.query);
  res.json(await service.listClientEstimates(id(req.params.projectId), page));
};

export const create: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json(
      await service.createClientEstimate(
        id(req.params.projectId),
        clientEstimateSchema.parse(req.body),
        req.user!.id,
      ),
    );
};

export const get: RequestHandler = async (req, res) => {
  res.json(
    service.serializeClientEstimate(
      await service.getClientEstimate(id(req.params.id)),
    ),
  );
};

export const update: RequestHandler = async (req, res) => {
  const { version, ...input } = clientEstimateUpdateSchema.parse(req.body);
  res.json(
    await service.updateClientEstimate(
      id(req.params.id),
      input,
      version,
      req.user!.id,
    ),
  );
};

export const status: RequestHandler = async (req, res) => {
  const input = clientEstimateStatusSchema.parse(req.body);
  res.json(
    await service.changeClientEstimateStatus(
      id(req.params.id),
      input.status,
      input.version,
      req.user!.id,
      req.user!.role,
    ),
  );
};

export const download: RequestHandler = async (req, res) => {
  const format = z.enum(["pdf", "excel"]).parse(req.params.format);
  const record = await service.getClientEstimate(id(req.params.id));
  const buffer =
    format === "pdf"
      ? await clientEstimatePdf(record)
      : await clientEstimateExcel(record);
  await clientEstimateRepository.auditExport(
    record.id,
    req.user!.id,
    format.toUpperCase(),
  );
  const extension = format === "pdf" ? "pdf" : "xlsx";
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${record.clientEstimateNumber}.${extension}"`,
  );
  res
    .type(
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    .send(buffer);
};
