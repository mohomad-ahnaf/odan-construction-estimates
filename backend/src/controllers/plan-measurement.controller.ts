import type { RequestHandler } from "express";
import { z } from "zod";
import {
  calibrationSchema,
  createMeasurementGroupSchema,
  createMeasurementSchema,
  deleteMeasurementGroupSchema,
  deleteMeasurementSchema,
  updateMeasurementSchema,
  updateMeasurementGroupSchema,
} from "../plan-measurement.validation.js";
import * as service from "../services/plan-measurement.service.js";

const id = (value: unknown) => z.string().uuid().parse(value);
const pageNumber = (value: unknown) => z.coerce.number().int().positive().max(10000).parse(value);

export const plans: RequestHandler = async (req, res) => {
  res.json(await service.listProjectPlans(id(req.params.projectId)));
};

export const summary: RequestHandler = async (req, res) => {
  res.json(await service.listProjectMeasurements(id(req.params.projectId)));
};

export const page: RequestHandler = async (req, res) => {
  res.json(
    await service.getPlanPage(
      id(req.params.projectId),
      id(req.params.documentId),
      pageNumber(req.params.pageNumber),
    ),
  );
};

export const groups: RequestHandler = async (req, res) => {
  res.json(await service.listMeasurementGroups(id(req.params.projectId), id(req.params.documentId)));
};

export const createGroup: RequestHandler = async (req, res) => {
  res.status(201).json(await service.createMeasurementGroup(
    id(req.params.projectId),
    id(req.params.documentId),
    createMeasurementGroupSchema.parse(req.body),
    req.user!.id,
  ));
};

export const renameGroup: RequestHandler = async (req, res) => {
  res.json(await service.renameMeasurementGroup(
    id(req.params.id),
    updateMeasurementGroupSchema.parse(req.body),
    req.user!.id,
  ));
};

export const removeGroup: RequestHandler = async (req, res) => {
  const input = deleteMeasurementGroupSchema.parse(req.body);
  const result = await service.deleteMeasurementGroup(id(req.params.id), input, req.user!.id);
  res.json(result);
};

export const calibrate: RequestHandler = async (req, res) => {
  res.json(
    await service.saveCalibration(
      id(req.params.projectId),
      id(req.params.documentId),
      calibrationSchema.parse(req.body),
      req.user!.id,
    ),
  );
};

export const create: RequestHandler = async (req, res) => {
  res.status(201).json(
    await service.createMeasurement(
      id(req.params.projectId),
      id(req.params.documentId),
      createMeasurementSchema.parse(req.body),
      req.user!.id,
    ),
  );
};

export const update: RequestHandler = async (req, res) => {
  res.json(
    await service.updateMeasurement(
      id(req.params.id),
      updateMeasurementSchema.parse(req.body),
      req.user!.id,
    ),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { version } = deleteMeasurementSchema.parse(req.body);
  await service.deleteMeasurement(id(req.params.id), version, req.user!.id);
  res.status(204).send();
};
