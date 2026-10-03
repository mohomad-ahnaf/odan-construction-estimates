import type { DesignerWall, PlanPoint } from "../types";

export function modelDistance(a: PlanPoint, b: PlanPoint) { return Math.hypot(b.x - a.x, b.y - a.y); }

export function resizedWall(wall: DesignerWall, lengthMeters: number): DesignerWall {
  const existing = modelDistance({ x: wall.startX, y: wall.startY }, { x: wall.endX, y: wall.endY });
  if (!(lengthMeters > 0) || !(existing > 0)) return wall;
  const ratio = lengthMeters / existing;
  return { ...wall, endX: wall.startX + (wall.endX - wall.startX) * ratio,
    endY: wall.startY + (wall.endY - wall.startY) * ratio };
}

export function snapModelPoint(point: PlanPoint, anchor: PlanPoint | null, walls: DesignerWall[],
  options: { endpoints: boolean; axis: boolean }, thresholdMeters: number) {
  if (options.endpoints) {
    const endpoints = walls.flatMap((wall) => [{ x: wall.startX, y: wall.startY }, { x: wall.endX, y: wall.endY }]);
    const nearest = endpoints.reduce<PlanPoint | null>((best, candidate) =>
      modelDistance(candidate, point) < thresholdMeters &&
      (!best || modelDistance(candidate, point) < modelDistance(best, point)) ? candidate : best, null);
    if (nearest) return { point: nearest, hint: "Endpoint snap" };
  }
  if (options.axis && anchor) {
    if (Math.abs(point.y - anchor.y) < thresholdMeters) return { point: { x: point.x, y: anchor.y }, hint: "Horizontal snap" };
    if (Math.abs(point.x - anchor.x) < thresholdMeters) return { point: { x: anchor.x, y: point.y }, hint: "Vertical snap" };
  }
  return { point, hint: "" };
}

export function wallPointAt(wall: DesignerWall, distanceMeters: number): PlanPoint {
  const length = modelDistance({ x: wall.startX, y: wall.startY }, { x: wall.endX, y: wall.endY });
  const fraction = length ? distanceMeters / length : 0;
  return { x: wall.startX + (wall.endX - wall.startX) * fraction,
    y: wall.startY + (wall.endY - wall.startY) * fraction };
}

export function projectToWall(wall: DesignerWall, point: PlanPoint) {
  const dx = wall.endX - wall.startX;
  const dy = wall.endY - wall.startY;
  const squared = dx * dx + dy * dy;
  const fraction = squared ? Math.min(1, Math.max(0, ((point.x - wall.startX) * dx + (point.y - wall.startY) * dy) / squared)) : 0;
  return fraction * Math.sqrt(squared);
}

export function wallSolidBands(wall: DesignerWall, trimStart = 0, trimEnd = 0) {
  const length = modelDistance({ x: wall.startX, y: wall.startY }, { x: wall.endX, y: wall.endY });
  const startEdge = Math.min(length, Math.max(0, trimStart));
  const endEdge = Math.max(startEdge, length - Math.max(0, trimEnd));
  const breaks = [startEdge, endEdge, ...wall.openings.flatMap((opening) => [opening.positionMeters, opening.positionMeters + opening.widthMeters])]
    .filter((value) => value >= startEdge && value <= endEdge).sort((a, b) => a - b);
  const unique = breaks.filter((value, index) => index === 0 || value - breaks[index - 1]! > 1e-8);
  const solids: { start: number; end: number; bottom: number; top: number }[] = [];
  for (let index = 0; index < unique.length - 1; index += 1) {
    const start = unique[index]!;
    const end = unique[index + 1]!;
    const opening = wall.openings.find((candidate) => candidate.positionMeters < (start + end) / 2 &&
      candidate.positionMeters + candidate.widthMeters > (start + end) / 2);
    const bands = opening ? [[0, opening.sillMeters], [opening.sillMeters + opening.heightMeters, wall.heightMeters]] : [[0, wall.heightMeters]];
    for (const [bottom, top] of bands) {
      if (top! - bottom! > 1e-6) solids.push({ start, end, bottom: bottom!, top: top! });
    }
  }
  return solids;
}


