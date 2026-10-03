import type { SaveDesignerInput } from "../designer.validation.js";
import { AppError } from "../middleware/errors.js";

export type DesignerWallInput = SaveDesignerInput["walls"][number];
export type DesignerJunctionInput = SaveDesignerInput["junctions"][number];
type Point = { x: number; y: number };
const EPS = 1e-6;

export function wallLength(wall: DesignerWallInput) {
  return Math.hypot(wall.endX - wall.startX, wall.endY - wall.startY);
}

function cross(a: Point, b: Point) { return a.x * b.y - a.y * b.x; }
function subtract(a: Point, b: Point): Point { return { x: a.x - b.x, y: a.y - b.y }; }
function pointOnSegment(point: Point, start: Point, end: Point) {
  const direction = subtract(end, start);
  const toPoint = subtract(point, start);
  const length = Math.hypot(direction.x, direction.y);
  return length > EPS && Math.abs(cross(direction, toPoint)) / length < 0.001 &&
    (toPoint.x * direction.x + toPoint.y * direction.y) >= -0.001 * length &&
    (toPoint.x * direction.x + toPoint.y * direction.y) <= length * length + 0.001 * length;
}

function segmentsMeet(first: DesignerWallInput, second: DesignerWallInput) {
  const a = { x: first.startX, y: first.startY };
  const b = { x: first.endX, y: first.endY };
  const c = { x: second.startX, y: second.startY };
  const d = { x: second.endX, y: second.endY };
  const ab = subtract(b, a);
  const cd = subtract(d, c);
  const denominator = cross(ab, cd);
  if (Math.abs(denominator) < EPS) {
    return pointOnSegment(a, c, d) || pointOnSegment(b, c, d) ||
      pointOnSegment(c, a, b) || pointOnSegment(d, a, b);
  }
  const t = cross(subtract(c, a), cd) / denominator;
  const u = cross(subtract(c, a), ab) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS;
}

function overlapOnSameLine(first: DesignerWallInput, second: DesignerWallInput) {
  const a = { x: first.startX, y: first.startY };
  const b = { x: first.endX, y: first.endY };
  const c = { x: second.startX, y: second.startY };
  const d = { x: second.endX, y: second.endY };
  const direction = subtract(b, a);
  const length = Math.hypot(direction.x, direction.y);
  if (Math.abs(cross(direction, subtract(c, a))) / length > 0.02 ||
      Math.abs(cross(direction, subtract(d, a))) / length > 0.02) return false;
  const project = (point: Point) => ((point.x - a.x) * direction.x + (point.y - a.y) * direction.y) / length;
  return Math.min(length, Math.max(project(c), project(d))) - Math.max(0, Math.min(project(c), project(d))) > 0.02;
}

export function calculateDesignerQuantities(walls: DesignerWallInput[], junctions: DesignerJunctionInput[]) {
  const wallMap = new Map(walls.map((wall) => [wall.id, wall]));
  const labels = new Set<string>();
  const elementIds = new Set<string>();
  const deductions = new Map<string, { start: number; end: number }>();
  const issues: string[] = [];
  for (const wall of walls) {
    if (elementIds.has(wall.id)) throw new AppError(400, "Duplicate model element ID");
    elementIds.add(wall.id);
    const normalized = wall.label.trim().toLocaleLowerCase();
    if (labels.has(normalized)) throw new AppError(400, "Wall labels must be unique");
    labels.add(normalized);
    const length = wallLength(wall);
    if (length <= EPS) throw new AppError(400, "Wall endpoints must be distinct");
    if (wall.faces[0].side === wall.faces[1].side)
      throw new AppError(400, "Each wall requires Face A and Face B");
    for (const face of wall.faces) {
      if ((face.plaster && !face.plasterHeightMeters) || (face.paint && !face.paintHeightMeters) ||
          (face.plasterHeightMeters !== null && face.plasterHeightMeters > wall.heightMeters) ||
          (face.paintHeightMeters !== null && face.paintHeightMeters > wall.heightMeters))
        throw new AppError(400, "Finish height must be positive and no higher than the wall");
    }
    const openings = [...wall.openings].sort((a, b) => a.positionMeters - b.positionMeters);
    for (let index = 0; index < openings.length; index += 1) {
      const opening = openings[index]!;
      if (elementIds.has(opening.id)) throw new AppError(400, "Duplicate model element ID");
      elementIds.add(opening.id);
      if (opening.positionMeters + opening.widthMeters > length + EPS ||
          opening.sillMeters + opening.heightMeters > wall.heightMeters + EPS ||
          (index > 0 && openings[index - 1]!.positionMeters + openings[index - 1]!.widthMeters > opening.positionMeters + EPS))
        throw new AppError(400, "Opening is outside its wall or overlaps another opening");
    }
  }
  const junctionEnds = new Set<string>();
  for (const junction of junctions) {
    if (elementIds.has(junction.id)) throw new AppError(400, "Duplicate model element ID");
    elementIds.add(junction.id);
    const continuous = wallMap.get(junction.continuousWallId);
    const adjoining = wallMap.get(junction.adjoiningWallId);
    if (!continuous || !adjoining || continuous.id === adjoining.id)
      throw new AppError(400, "Junction walls must belong to this model");
    const key = `${adjoining.id}:${junction.adjoiningEnd}`;
    if (junctionEnds.has(key)) throw new AppError(400, "A wall end can have only one butt joint");
    junctionEnds.add(key);
    const endpoint = junction.adjoiningEnd === "START"
      ? { x: adjoining.startX, y: adjoining.startY }
      : { x: adjoining.endX, y: adjoining.endY };
    if (!pointOnSegment(endpoint, { x: continuous.startX, y: continuous.startY }, { x: continuous.endX, y: continuous.endY }))
      throw new AppError(400, "Adjoining wall endpoint must touch the continuous wall");
    const cdx = continuous.endX - continuous.startX, cdy = continuous.endY - continuous.startY;
    const adx = adjoining.endX - adjoining.startX, ady = adjoining.endY - adjoining.startY;
    const cosine = Math.abs((cdx * adx + cdy * ady) / (Math.hypot(cdx, cdy) * Math.hypot(adx, ady)));
    if (cosine > 0.02) issues.push(`Junction between ${continuous.label} and ${adjoining.label} is not square; review is unavailable.`);
    const deduction = continuous.thicknessMeters / 2;
    const current = deductions.get(adjoining.id) ?? { start: 0, end: 0 };
    current[junction.adjoiningEnd === "START" ? "start" : "end"] = deduction;
    deductions.set(adjoining.id, current);
  }
  const trimEdges = new Map<string, string[]>();
  for (const junction of junctions) trimEdges.set(junction.adjoiningWallId,
    [...(trimEdges.get(junction.adjoiningWallId) ?? []), junction.continuousWallId]);
  const visited = new Set<string>(), active = new Set<string>();
  const cyclic = (id: string): boolean => {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    active.add(id);
    if ((trimEdges.get(id) ?? []).some(cyclic)) return true;
    active.delete(id); visited.add(id); return false;
  };
  if ([...trimEdges.keys()].some(cyclic))
    issues.push("Cyclic junction trimming cannot be calculated reliably; disconnect and reconnect the affected walls.");
  for (let first = 0; first < walls.length; first += 1) {
    for (let second = first + 1; second < walls.length; second += 1) {
      const a = walls[first]!;
      const b = walls[second]!;
      if (overlapOnSameLine(a, b)) {
        issues.push(`Walls ${a.label} and ${b.label} overlap; resolve before review.`);
      } else if (segmentsMeet(a, b) && !junctions.some((junction) =>
        (junction.continuousWallId === a.id && junction.adjoiningWallId === b.id) ||
        (junction.continuousWallId === b.id && junction.adjoiningWallId === a.id))) {
        issues.push(`Walls ${a.label} and ${b.label} meet without a resolved butt joint.`);
      }
    }
  }
  const perWall = walls.map((wall) => {
    const length = wallLength(wall);
    const trim = deductions.get(wall.id) ?? { start: 0, end: 0 };
    if (trim.start + trim.end >= length) issues.push(`Wall ${wall.label} has excessive junction trimming.`);
    if (wall.openings.some((opening) => opening.positionMeters < trim.start - EPS ||
        opening.positionMeters + opening.widthMeters > length - trim.end + EPS))
      issues.push(`Wall ${wall.label} has an opening inside a junction trim.`);
    const openingArea = wall.openings.reduce((sum, opening) => sum + opening.widthMeters * opening.heightMeters, 0);
    const junctionArea = (trim.start + trim.end) * wall.heightMeters;
    const grossArea = length * wall.heightMeters;
    const netArea = Math.max(0, grossArea - openingArea - junctionArea);
    const faces = wall.faces.map((face) => {
      const finish = (height: number | null, selected: boolean) => {
        if (!selected || !height) return { grossArea: 0, openingDeduction: 0, junctionDeduction: 0, netArea: 0 };
        const deducted = wall.openings.reduce((sum, opening) =>
          sum + opening.widthMeters * Math.max(0, Math.min(height, opening.sillMeters + opening.heightMeters) - opening.sillMeters), 0);
        const junctionDeduction = (trim.start + trim.end) * height;
        return { grossArea: length * height, openingDeduction: deducted,
          junctionDeduction, netArea: Math.max(0, length * height - deducted - junctionDeduction) };
      };
      return { side: face.side, roomName: face.roomName,
        plaster: finish(face.plasterHeightMeters, face.plaster),
        paint: finish(face.paintHeightMeters, face.paint) };
    });
    return { id: wall.id, label: wall.label, lengthMeters: length, grossArea, openingDeduction: openingArea,
      junctionDeduction: junctionArea, netMasonryArea: netArea, masonryVolume: netArea * wall.thicknessMeters,
      faces };
  });
  return {
    convention: "Wall centreline lengths; adjoining butt-joint walls trim to the continuous wall face. Geometric opening deductions; reveals excluded.",
    issues,
    walls: perWall,
    totals: {
      walls: walls.length,
      grossArea: perWall.reduce((sum, wall) => sum + wall.grossArea, 0),
      openingDeduction: perWall.reduce((sum, wall) => sum + wall.openingDeduction, 0),
      junctionDeduction: perWall.reduce((sum, wall) => sum + wall.junctionDeduction, 0),
      netMasonryArea: perWall.reduce((sum, wall) => sum + wall.netMasonryArea, 0),
      masonryVolume: perWall.reduce((sum, wall) => sum + wall.masonryVolume, 0),
      plasterArea: perWall.reduce((sum, wall) => sum + wall.faces.reduce((faceSum, face) => faceSum + face.plaster.netArea, 0), 0),
      paintArea: perWall.reduce((sum, wall) => sum + wall.faces.reduce((faceSum, face) => faceSum + face.paint.netArea, 0), 0),
      doors: walls.reduce((sum, wall) => sum + wall.openings.filter((opening) => opening.type === "DOOR").length, 0),
      windows: walls.reduce((sum, wall) => sum + wall.openings.filter((opening) => opening.type === "WINDOW").length, 0),
    },
  };
}


