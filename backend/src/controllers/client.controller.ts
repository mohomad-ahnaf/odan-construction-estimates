import type { RequestHandler } from "express";
import { z } from "zod";
import { clientSchema, projectSchema, listSchema } from "../validation.js";
import { clientService as repo } from "../services/client.service.js";
const id = (value: unknown) => z.string().uuid().parse(value);
export const list: RequestHandler = async (req, res) => {
  res.json(await repo.list(listSchema.parse(req.query)));
};
export const get: RequestHandler = async (req, res) => {
  res.json(await repo.get(id(req.params.id)));
};
export const create: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json(await repo.create(clientSchema.parse(req.body), req.user!.id));
};
export const update: RequestHandler = async (req, res) => {
  res.json(
    await repo.update(
      id(req.params.id),
      clientSchema.parse(req.body),
      req.user!.id,
    ),
  );
};
export const status: RequestHandler = async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).strict().parse(req.body);
  res.json(await repo.status(id(req.params.id), active, req.user!.id));
};
export const projects: RequestHandler = async (req, res) => {
  res.json(await repo.projects(id(req.params.id), listSchema.parse(req.query)));
};
export const estimates: RequestHandler = async (req, res) => {
  res.json(
    await repo.estimates(id(req.params.id), listSchema.parse(req.query)),
  );
};
export const activity: RequestHandler = async (req, res) => {
  res.json(await repo.activity(id(req.params.id), listSchema.parse(req.query)));
};
export const createProject: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json(
      await repo.createProject(
        id(req.params.clientId),
        projectSchema.parse(req.body),
        req.user!.id,
      ),
    );
};
export const getProject: RequestHandler = async (req, res) => {
  res.json(await repo.getProject(id(req.params.id)));
};
export const updateProject: RequestHandler = async (req, res) => {
  res.json(
    await repo.updateProject(
      id(req.params.id),
      projectSchema.parse(req.body),
      req.user!.id,
    ),
  );
};
export const statusProject: RequestHandler = async (req, res) => {
  const { status } = z
    .object({ status: z.enum(["ACTIVE", "ARCHIVED"]) })
    .strict()
    .parse(req.body);
  res.json(await repo.statusProject(id(req.params.id), status, req.user!.id));
};
export const dashboard: RequestHandler = async (_req, res) => {
  res.json(await repo.dashboard());
};
