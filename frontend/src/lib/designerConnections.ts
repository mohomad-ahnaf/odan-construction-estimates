import type { DesignerJunction, DesignerWall, PlanPoint } from "../types";
import { modelDistance, projectToWall, wallPointAt } from "./designerGeometry";

export type WallEnd = "START" | "END";
export type SnapCandidate = { wallId: string; point: PlanPoint; kind: "CORNER" | "T"; distancePx: number };
export type SnapIntent = { point: PlanPoint; candidates: SnapCandidate[]; chosenWallId: string | null };
export type EndIntents = { START: SnapIntent | null; END: SnapIntent | null };
export const SNAP_RADIUS_PX = 14;
const TOUCH_EPS = .001;
const SQUARE_COSINE = .02;

export function endpoint(wall: DesignerWall, end: WallEnd): PlanPoint {
  return end === "START" ? { x: wall.startX, y: wall.startY } : { x: wall.endX, y: wall.endY };
}
export function findWallSnap(point: PlanPoint, walls: DesignerWall[], toScreen: (point: PlanPoint) => PlanPoint,
  pointer: PlanPoint, radiusPx = SNAP_RADIUS_PX, excludeWallId?: string): SnapIntent | null {
  const candidates = walls.filter((wall) => wall.id !== excludeWallId).flatMap((wall) => {
    const near = wallPointAt(wall, projectToWall(wall, point));
    const ends = [endpoint(wall, "START"), endpoint(wall, "END")];
    const corner = ends.find((end) => modelDistance(toScreen(end), pointer) <= radiusPx);
    const target = corner ?? near;
    const distancePx = modelDistance(toScreen(target), pointer);
    return distancePx <= radiusPx ? [{ wallId: wall.id, point: target,
      kind: corner ? "CORNER" as const : "T" as const, distancePx }] : [];
  }).sort((a, b) => a.distancePx - b.distancePx || a.wallId.localeCompare(b.wallId));
  if (!candidates.length) return null;
  return { point: candidates[0]!.point, candidates, chosenWallId: candidates.length === 1 ? candidates[0]!.wallId : null };
}

export function connectionTarget(wall: DesignerWall, end: WallEnd, intent: SnapIntent | null,
  existingWalls: DesignerWall[]): { candidate: SnapCandidate | null; warning: string | null; ambiguous: boolean } {
  if (!intent) return { candidate: null, warning: null, ambiguous: false };
  const location = endpoint(wall, end);
  const eligible = intent.candidates.filter((candidate) => {
    const target = existingWalls.find((item) => item.id === candidate.wallId);
    if (!target || modelDistance(location, candidate.point) > TOUCH_EPS) return false;
    const dx = wall.endX - wall.startX, dy = wall.endY - wall.startY;
    const tx = target.endX - target.startX, ty = target.endY - target.startY;
    const cosine = Math.abs((dx * tx + dy * ty) / (Math.hypot(dx, dy) * Math.hypot(tx, ty)));
    return Number.isFinite(cosine) && cosine <= SQUARE_COSINE;
  });
  if (!eligible.length) return { candidate: null,
    warning: `The ${end.toLowerCase()} endpoint is no longer at a supported square corner or T-junction. Adjust the exact dimensions or placement to join.`,
    ambiguous: false };
  if (eligible.length > 1 && !intent.chosenWallId) return { candidate: null,
    warning: `Several walls meet the ${end.toLowerCase()} endpoint. Choose the intended wall.`, ambiguous: true };
  const chosen = eligible.length === 1 ? eligible[0] : eligible.find((candidate) => candidate.wallId === intent.chosenWallId);
  if (!chosen) return { candidate: null, warning: "Choose a valid connection target.", ambiguous: eligible.length > 1 };
  return { candidate: chosen, warning: null, ambiguous: false };
}

export function createsTrimCycle(junctions: DesignerJunction[]) {
  const edges = new Map<string, string[]>();
  for (const junction of junctions) edges.set(junction.adjoiningWallId,
    [...(edges.get(junction.adjoiningWallId) ?? []), junction.continuousWallId]);
  const visited = new Set<string>(), active = new Set<string>();
  const walk = (id: string): boolean => {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    active.add(id);
    if ((edges.get(id) ?? []).some(walk)) return true;
    active.delete(id); visited.add(id); return false;
  };
  return [...edges.keys()].some(walk);
}

export function plannedConnections(wall: DesignerWall, existingWalls: DesignerWall[],
  current: DesignerJunction[], intents: EndIntents, makeId: () => string) {
  const next = [...current];
  const warnings: string[] = [];
  const preview: { end: WallEnd; targetWallId: string; kind: "CORNER" | "T"; trimMeters: number }[] = [];
  for (const end of ["START", "END"] as const) {
    const intent = intents[end];
    if (!intent) continue;
    const result = connectionTarget(wall, end, intent, existingWalls);
    if (result.warning) { warnings.push(result.warning); continue; }
    const candidate = result.candidate!;
    const target = existingWalls.find((item) => item.id === candidate.wallId)!;
    const original = next.find((item) => item.adjoiningWallId === wall.id && item.adjoiningEnd === end);
    if (original?.continuousWallId === target.id) continue;
    const replacement = { id: makeId(), continuousWallId: target.id, adjoiningWallId: wall.id,
      adjoiningEnd: end };
    const index = next.findIndex((item) => item.adjoiningWallId === wall.id && item.adjoiningEnd === end);
    if (index >= 0) next.splice(index, 1, replacement); else next.push(replacement);
    preview.push({ end, targetWallId: target.id, kind: candidate.kind, trimMeters: target.thicknessMeters / 2 });
  }
  if (createsTrimCycle(next)) warnings.push("This join would create a cycle of trimmed walls. Choose another target or disconnect an existing join.");
  return { junctions: next, warnings, preview };
}
