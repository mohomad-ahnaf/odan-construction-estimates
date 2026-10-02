import type { PlanPoint } from "../types";

export type ViewRect = { left: number; top: number; width: number; height: number };

export const PLAN_CANVAS_MAX_PIXELS = 32_000_000;
export const PLAN_CANVAS_MAX_DIMENSION = 8_192;

export function planCanvasRenderMetrics(
  displayWidth: number,
  displayHeight: number,
  devicePixelRatio: number,
  maxPixels = PLAN_CANVAS_MAX_PIXELS,
  maxDimension = PLAN_CANVAS_MAX_DIMENSION,
) {
  const safeWidth = Math.max(1, displayWidth);
  const safeHeight = Math.max(1, displayHeight);
  const requestedRatio = Math.max(1, devicePixelRatio);
  const dimensionRatio = Math.min(maxDimension / safeWidth, maxDimension / safeHeight);
  const areaRatio = Math.sqrt(maxPixels / (safeWidth * safeHeight));
  const outputScale = Math.max(Number.EPSILON, Math.min(requestedRatio, dimensionRatio, areaRatio));

  return {
    outputScale,
    pixelWidth: Math.max(1, Math.floor(safeWidth * outputScale)),
    pixelHeight: Math.max(1, Math.floor(safeHeight * outputScale)),
  };
}

export function clientToPagePoint(
  clientX: number,
  clientY: number,
  rect: ViewRect,
  pageWidth: number,
  pageHeight: number,
): PlanPoint {
  return {
    x: ((clientX - rect.left) / rect.width) * pageWidth,
    y: ((clientY - rect.top) / rect.height) * pageHeight,
  };
}

export function clientToRotatedPagePoint(
  clientX: number,
  clientY: number,
  rect: ViewRect,
  pageWidth: number,
  pageHeight: number,
  rotation: 0 | 90 | 180 | 270,
): PlanPoint {
  const horizontal = (clientX - rect.left) / rect.width;
  const vertical = (clientY - rect.top) / rect.height;
  if (rotation === 90)
    return { x: vertical * pageWidth, y: (1 - horizontal) * pageHeight };
  if (rotation === 180)
    return { x: (1 - horizontal) * pageWidth, y: (1 - vertical) * pageHeight };
  if (rotation === 270)
    return { x: (1 - vertical) * pageWidth, y: horizontal * pageHeight };
  return { x: horizontal * pageWidth, y: vertical * pageHeight };
}

export function pageDistance(a: PlanPoint, b: PlanPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pagePolygonArea(points: PlanPoint[]) {
  return Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0),
  ) / 2;
}

export function fitPlanScale(
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
  padding = 24,
) {
  return Math.max(
    0.01,
    Math.min(
      (containerWidth - padding * 2) / pageWidth,
      (containerHeight - padding * 2) / pageHeight,
    ),
  );
}
