import type { PlanMeasurement, PlanPoint } from "../types";
import { pageDistance, pagePolygonArea } from "./planGeometry";

export type DisplayUnitSystem = "METRIC" | "IMPERIAL";
export type MeasurementKind = PlanMeasurement["type"];

const METRES_PER_FOOT = 0.3048;
const SQUARE_METRES_PER_SQUARE_FOOT = 0.09290304;

export function measurementTotals(measurements: Array<Pick<PlanMeasurement, "type" | "label" | "quantity">>) {
  const result = { length: 0, area: 0, count: 0, counts: {} as Record<string, number> };
  for (const measurement of measurements) {
    const quantity = Number(measurement.quantity);
    if (measurement.type === "LENGTH") result.length += quantity;
    else if (measurement.type === "AREA") result.area += quantity;
    else {
      result.count += quantity;
      result.counts[measurement.label] = (result.counts[measurement.label] ?? 0) + quantity;
    }
  }
  return result;
}

export function measurementDraftComplete(type: MeasurementKind, points: PlanPoint[]) {
  if (type === "LENGTH") return points.length === 2;
  if (type === "AREA") return points.length >= 3;
  return points.length >= 1;
}

export function draftQuantityInMetric(
  type: MeasurementKind,
  points: PlanPoint[],
  metresPerPageUnit: number | null,
) {
  if (type === "COUNT") return points.length;
  if (!metresPerPageUnit || !measurementDraftComplete(type, points)) return null;
  if (type === "LENGTH") return pageDistance(points[0]!, points[1]!) * metresPerPageUnit;
  return pagePolygonArea(points) * metresPerPageUnit * metresPerPageUnit;
}

export function convertMetricQuantity(
  type: MeasurementKind,
  metricQuantity: number,
  displayUnits: DisplayUnitSystem,
) {
  if (type === "COUNT" || displayUnits === "METRIC") return metricQuantity;
  return type === "LENGTH"
    ? metricQuantity / METRES_PER_FOOT
    : metricQuantity / SQUARE_METRES_PER_SQUARE_FOOT;
}

export function displayUnit(type: MeasurementKind, displayUnits: DisplayUnitSystem) {
  if (type === "COUNT") return "count";
  if (displayUnits === "IMPERIAL") return type === "LENGTH" ? "ft" : "ft²";
  return type === "LENGTH" ? "m" : "m²";
}

export function formatPlanQuantity(
  type: MeasurementKind,
  metricQuantity: number,
  displayUnits: DisplayUnitSystem,
) {
  const converted = convertMetricQuantity(type, metricQuantity, displayUnits);
  const value = type === "COUNT"
    ? Math.round(converted).toString()
    : converted.toFixed(type === "AREA" ? 2 : 3);
  return `${value} ${displayUnit(type, displayUnits)}`;
}
