import { AppError } from "../middleware/errors.js";
import { designerGeometrySchema, type DesignerGeometry, type SaveDesignerInput } from "../designer.validation.js";
import { designerRepository as repository } from "../repositories/designer.repository.js";
import { calculateDesignerQuantities } from "./designer-quantities.js";

async function requireProject(projectId: string, write = false) {
  const project = await repository.project(projectId);
  if (!project) throw new AppError(404, "Project not found");
  if (write && (project.status !== "ACTIVE" || !project.client.active))
    throw new AppError(409, "The project and client must be active to edit a model");
}
function present(model: NonNullable<Awaited<ReturnType<typeof repository.model>>>) {
  const geometry = designerGeometrySchema.parse(model.geometry);
  return { id: model.id, projectId: model.projectId, name: model.name,
    floorHeightMeters: model.floorHeightMeters, version: model.version,
    status: model.status, ...geometry,
    quantities: calculateDesignerQuantities(geometry.walls, geometry.junctions),
    createdAt: model.createdAt, updatedAt: model.updatedAt };
}
export async function getDesigner(projectId: string) {
  await requireProject(projectId);
  const model = await repository.model(projectId);
  return model ? present(model) : null;
}
export async function createDesigner(projectId: string, input: { name: string; floorHeightMeters: number }, actorId: string) {
  await requireProject(projectId, true);
  await repository.create(projectId, input.name, input.floorHeightMeters, actorId);
  return getDesigner(projectId);
}
export async function saveDesigner(projectId: string, input: SaveDesignerInput, actorId: string) {
  await requireProject(projectId, true);
  const model = await repository.model(projectId);
  if (!model) throw new AppError(404, "3D Designer model not found");
  if (model.version !== input.version) throw new AppError(409, "The model has changed; reload before saving");
  const quantities = calculateDesignerQuantities(input.walls, input.junctions);
  if (quantities.issues.some((issue) => issue.includes("excessive junction trimming") || issue.includes("opening inside a junction trim") || issue.includes("Cyclic junction trimming")))
    throw new AppError(400, "Correct wall connections and hosted openings before saving");
  await repository.save(model.id, projectId, input, actorId);
  return getDesigner(projectId);
}
export async function reviewDesigner(projectId: string, version: number, actorId: string) {
  await requireProject(projectId, true);
  const model = await repository.model(projectId);
  if (!model) throw new AppError(404, "3D Designer model not found");
  if (model.version !== version) throw new AppError(409, "The model has changed; reload before review");
  const geometry: DesignerGeometry = designerGeometrySchema.parse(model.geometry);
  const quantities = calculateDesignerQuantities(geometry.walls, geometry.junctions);
  if (!geometry.walls.length || quantities.issues.length)
    throw new AppError(409, "Resolve model issues before reviewing quantities");
  await repository.review(model.id, version, actorId);
  return getDesigner(projectId);
}
