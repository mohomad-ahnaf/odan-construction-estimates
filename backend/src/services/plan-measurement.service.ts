import type { MeasurementType } from "@prisma/client";
import { AppError } from "../middleware/errors.js";
import type {
  CalibrationInput,
  CreateMeasurementGroupInput,
  CreateMeasurementInput,
  DeleteMeasurementGroupInput,
  ReferenceLengthInput,
  UpdateMeasurementInput,
  UpdateMeasurementGroupInput,
} from "../plan-measurement.validation.js";
import { planMeasurementRepository as repository } from "../repositories/plan-measurement.repository.js";

type Point = { x: number; y: number };
const epsilon = 1e-9;

export function convertLengthToMeters(input: ReferenceLengthInput) {
  if (input.unit === "ft")
    return (input.feet! * 12 + input.inches!) * 0.0254;
  const value = input.value!;
  return value * ({ mm: 0.001, cm: 0.01, m: 1, in: 0.0254 }[input.unit]);
}

export function pointDistance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polygonPageArea(points: Point[]) {
  let doubled = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]!;
    doubled += points[index]!.x * next.y - next.x * points[index]!.y;
  }
  return Math.abs(doubled) / 2;
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < -epsilon && o3 * o4 < -epsilon;
}

export function isSelfIntersectingPolygon(points: Point[]) {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (
        first === second ||
        firstNext === second ||
        secondNext === first
      )
        continue;
      if (
        segmentsIntersect(
          points[first]!,
          points[firstNext]!,
          points[second]!,
          points[secondNext]!,
        )
      )
        return true;
    }
  }
  return false;
}

function validateDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new AppError(400, "Invalid plan page dimensions");
}

function dimensionsMatch(
  first: { pageWidth: number; pageHeight: number },
  second: { pageWidth: number; pageHeight: number },
) {
  return (
    Math.abs(first.pageWidth - second.pageWidth) <= 0.001 &&
    Math.abs(first.pageHeight - second.pageHeight) <= 0.001
  );
}

function validatePoints(points: Point[], width: number, height: number) {
  validateDimensions(width, height);
  for (const point of points)
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > width ||
      point.y > height
    )
      throw new AppError(400, "Measurement geometry is outside the plan page");
}

async function requirePlanDocument(documentId: string, projectId?: string) {
  const document = await repository.getDocument(documentId);
  if (!document || (projectId && document.projectId !== projectId))
    throw new AppError(404, "Plan document not found");
  if (
    document.category !== "DRAWINGS" ||
    !["application/pdf", "image/png", "image/jpeg"].includes(document.fileType)
  )
    throw new AppError(409, "Document is not a supported Drawing plan");
  return document;
}

function validatePage(document: { fileType: string }, pageNumber: number) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1)
    throw new AppError(400, "Invalid plan page number");
  if (document.fileType !== "application/pdf" && pageNumber !== 1)
    throw new AppError(400, "Image plans contain only one page");
}

function serializeCalibration(calibration: Awaited<ReturnType<typeof repository.getCalibration>>) {
  if (!calibration) return null;
  const reference = calibration.referenceGeometry as { points: Point[] };
  const referencePageLength = pointDistance(reference.points[0]!, reference.points[1]!);
  const metresPerPageUnit = Number(calibration.referenceLengthMeters) / referencePageLength;
  let checkDifferencePercent: number | null = null;
  if (calibration.checkReferenceGeometry && calibration.checkReferenceLengthMeters) {
    const check = calibration.checkReferenceGeometry as { points: Point[] };
    const calculated = pointDistance(check.points[0]!, check.points[1]!) * metresPerPageUnit;
    const actual = Number(calibration.checkReferenceLengthMeters);
    checkDifferencePercent = Math.abs(calculated - actual) / actual * 100;
  }
  return {
    ...calibration,
    referenceLengthMeters: calibration.referenceLengthMeters.toString(),
    checkReferenceLengthMeters: calibration.checkReferenceLengthMeters?.toString() ?? null,
    metresPerPageUnit,
    checkDifferencePercent,
  };
}

function serializeMeasurement<T extends { quantity: { toString(): string } }>(measurement: T) {
  return { ...measurement, quantity: measurement.quantity.toString() };
}

export async function listProjectPlans(projectId: string) {
  if (!(await repository.findProject(projectId))) throw new AppError(404, "Project not found");
  return (await repository.listPlanDocuments(projectId)).map((document) => ({
    id: document.id,
    projectId: document.projectId,
    fileName: document.fileName,
    fileType: document.fileType,
    version: document.version,
    versionGroupId: document.versionGroupId,
    isLatest: document.isLatest,
    status: document.status,
    createdAt: document.createdAt,
    uploader: document.uploader,
  }));
}

export async function getPlanPage(projectId: string, documentId: string, pageNumber: number) {
  const document = await requirePlanDocument(documentId, projectId);
  validatePage(document, pageNumber);
  const [calibration, measurements] = await Promise.all([
    repository.getCalibration(documentId, pageNumber),
    repository.listMeasurements(documentId, pageNumber),
  ]);
  return {
    document,
    calibration: serializeCalibration(calibration),
    measurements: measurements.map(serializeMeasurement),
  };
}

export async function listProjectMeasurements(projectId: string) {
  if (!(await repository.findProject(projectId))) throw new AppError(404, "Project not found");
  return (await repository.listProjectMeasurements(projectId)).map(serializeMeasurement);
}

export async function listMeasurementGroups(projectId: string, documentId: string) {
  await requirePlanDocument(documentId, projectId);
  return repository.listGroups(documentId);
}

export async function createMeasurementGroup(
  projectId: string,
  documentId: string,
  input: CreateMeasurementGroupInput,
  actorId: string,
) {
  await requirePlanDocument(documentId, projectId);
  return repository.createGroup({ documentId, name: input.name, actorId });
}

export async function renameMeasurementGroup(
  id: string,
  input: UpdateMeasurementGroupInput,
  actorId: string,
) {
  const group = await repository.getGroup(id);
  if (!group) throw new AppError(404, "Measurement group not found");
  await requirePlanDocument(group.documentId);
  return repository.renameGroup(id, input.version, input.name, actorId);
}

export async function deleteMeasurementGroup(id: string, input: DeleteMeasurementGroupInput, actorId: string) {
  const group = await repository.getGroup(id);
  if (!group) throw new AppError(404, "Measurement group not found");
  await requirePlanDocument(group.documentId);
  return repository.deleteGroup(id, input, actorId);
}

export async function saveCalibration(
  projectId: string,
  documentId: string,
  input: CalibrationInput,
  actorId: string,
) {
  const document = await requirePlanDocument(documentId, projectId);
  validatePage(document, input.pageNumber);
  validatePoints(input.reference.points, input.pageWidth, input.pageHeight);
  const referencePageLength = pointDistance(...input.reference.points);
  if (referencePageLength <= epsilon)
    throw new AppError(400, "Reference points must have a measurable distance");
  const actualMetres = convertLengthToMeters(input.reference.length);
  if (!Number.isFinite(actualMetres) || actualMetres <= 0)
    throw new AppError(400, "Reference length must be positive");
  if (input.checkReference) {
    validatePoints(input.checkReference.points, input.pageWidth, input.pageHeight);
    if (pointDistance(...input.checkReference.points) <= epsilon)
      throw new AppError(400, "Check reference points must have a measurable distance");
  }
  const metresPerPageUnit = actualMetres / referencePageLength;
  const existingMeasurements = await repository.listMeasurements(documentId, input.pageNumber);
  if (existingMeasurements.some((measurement) => !dimensionsMatch(measurement, input)))
    throw new AppError(409, "Plan page dimensions have changed; reload the document");
  const measurementQuantities = existingMeasurements.map((measurement) => {
    const points = (measurement.geometry as { points: Point[] }).points;
    const quantity = measurement.type === "LENGTH"
      ? pointDistance(points[0]!, points[1]!) * metresPerPageUnit
      : measurement.type === "AREA"
        ? polygonPageArea(points) * metresPerPageUnit * metresPerPageUnit
        : points.length;
    return { id: measurement.id, quantity: quantity.toFixed(10) };
  });
  const calibration = await repository.saveCalibration({
    documentId,
    pageNumber: input.pageNumber,
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
    referenceGeometry: { points: input.reference.points },
    referenceLengthMeters: actualMetres.toFixed(10),
    referenceUnit: input.reference.length.unit,
    checkReferenceGeometry: input.checkReference
      ? { points: input.checkReference.points }
      : undefined,
    checkReferenceLengthMeters: input.checkReference
      ? convertLengthToMeters(input.checkReference.length).toFixed(10)
      : undefined,
    actorId,
    version: input.version,
    measurementQuantities,
  });
  return serializeCalibration(calibration);
}

function measurementQuantity(
  type: MeasurementType,
  points: Point[],
  calibration: Awaited<ReturnType<typeof repository.getCalibration>>,
) {
  if (type === "COUNT") return { quantity: points.length, unit: "count" };
  if (!calibration)
    throw new AppError(409, "Set the page scale before measuring lengths or areas");
  const reference = calibration.referenceGeometry as { points: Point[] };
  const scale = Number(calibration.referenceLengthMeters) /
    pointDistance(reference.points[0]!, reference.points[1]!);
  if (type === "LENGTH") {
    if (points.length !== 2 || pointDistance(points[0]!, points[1]!) <= epsilon)
      throw new AppError(400, "Length measurements require two distinct points");
    return { quantity: pointDistance(points[0]!, points[1]!) * scale, unit: "m" };
  }
  if (points.length < 3 || polygonPageArea(points) <= epsilon)
    throw new AppError(400, "Area measurements require a non-degenerate polygon");
  if (isSelfIntersectingPolygon(points))
    throw new AppError(400, "Area polygon cannot intersect itself");
  return { quantity: polygonPageArea(points) * scale * scale, unit: "m²" };
}

export async function createMeasurement(
  projectId: string,
  documentId: string,
  input: CreateMeasurementInput,
  actorId: string,
) {
  const document = await requirePlanDocument(documentId, projectId);
  const group = await repository.getGroup(input.groupId);
  if (!group || group.documentId !== document.id)
    throw new AppError(409, "Measurement group does not belong to this drawing revision");
  validatePage(document, input.pageNumber);
  validatePoints(input.geometry.points, input.pageWidth, input.pageHeight);
  const calibration = await repository.getCalibration(documentId, input.pageNumber);
  if (input.type !== "COUNT" && calibration && !dimensionsMatch(calibration, input))
    throw new AppError(409, "Plan page dimensions do not match the saved calibration");
  const calculated = measurementQuantity(input.type, input.geometry.points, calibration);
  return serializeMeasurement(await repository.createMeasurement({
    documentId,
    groupId: group.id,
    pageNumber: input.pageNumber,
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
    type: input.type,
    label: input.label,
    geometry: input.geometry,
    quantity: calculated.quantity.toFixed(10),
    unit: calculated.unit,
    actorId,
  }));
}

export async function updateMeasurement(
  id: string,
  input: UpdateMeasurementInput,
  actorId: string,
) {
  const existing = await repository.getMeasurement(id);
  if (!existing) throw new AppError(404, "Measurement not found");
  await requirePlanDocument(existing.documentId);
  const data: {
    label?: string;
    groupId?: string;
    geometry?: { points: Point[] };
    quantity?: string;
    unit?: string;
    confirmed?: boolean;
  } = {};
  if (input.groupId !== undefined) {
    const group = await repository.getGroup(input.groupId);
    if (!group || group.documentId !== existing.documentId)
      throw new AppError(409, "Measurement group does not belong to this drawing revision");
    data.groupId = group.id;
  }
  if (input.label !== undefined) data.label = input.label;
  if (input.geometry) {
    validatePoints(input.geometry.points, existing.pageWidth, existing.pageHeight);
    const calibration = await repository.getCalibration(existing.documentId, existing.pageNumber);
    const calculated = measurementQuantity(existing.type, input.geometry.points, calibration);
    data.geometry = input.geometry;
    data.quantity = calculated.quantity.toFixed(10);
    data.unit = calculated.unit;
    data.confirmed = false;
  } else if (input.confirmed !== undefined) {
    data.confirmed = input.confirmed;
  }
  return serializeMeasurement(
    await repository.updateMeasurement(id, input.version, data, actorId),
  );
}

export async function deleteMeasurement(id: string, version: number, actorId: string) {
  const existing = await repository.getMeasurement(id);
  if (!existing) throw new AppError(404, "Measurement not found");
  await requirePlanDocument(existing.documentId);
  await repository.deleteMeasurement(id, version, actorId);
}
