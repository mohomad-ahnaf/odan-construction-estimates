import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { calculateDesignerQuantities, type DesignerWallInput } from "./designer-quantities.js";

const wall = (overrides: Partial<DesignerWallInput> = {}): DesignerWallInput => ({
  id: randomUUID(), label: "Wall A", startX: 0, startY: 0, endX: 6, endY: 0,
  heightMeters: 3, thicknessMeters: .2, alignment: "CENTRELINE",
  faces: ["A", "B"].map((side) => ({ side, roomName: null, plaster: true,
    plasterHeightMeters: 3, paint: true, paintHeightMeters: 3 })) as DesignerWallInput["faces"],
  openings: [{ id: randomUUID(), type: "DOOR", label: "Entry", positionMeters: 1,
    widthMeters: 1, heightMeters: 2, sillMeters: 0 }], ...overrides,
});

describe("standalone designer quantities", () => {
  it("deducts a door from masonry and both finished faces", () => {
    const result = calculateDesignerQuantities([wall()], []);
    expect(result.totals.grossArea).toBe(18);
    expect(result.totals.netMasonryArea).toBe(16);
    expect(result.totals.masonryVolume).toBeCloseTo(3.2);
    expect(result.totals.plasterArea).toBe(32);
    expect(result.totals.paintArea).toBe(32);
    expect(result.totals.doors).toBe(1);
  });
  it("uses actual opening overlap with partial finish height and window sill", () => {
    const first = wall({ openings: [{ id: randomUUID(), type: "WINDOW", label: "Window",
      positionMeters: 1, widthMeters: 2, heightMeters: 1, sillMeters: 1 }],
      faces: ["A", "B"].map((side) => ({ side, roomName: null, plaster: true,
        plasterHeightMeters: 1.5, paint: false, paintHeightMeters: 3 })) as DesignerWallInput["faces"] });
    const result = calculateDesignerQuantities([first], []);
    expect(result.totals.openingDeduction).toBe(2);
    expect(result.totals.plasterArea).toBe(16);
  });
  it("rejects openings outside the wall and horizontal overlap", () => {
    const first = wall();
    expect(() => calculateDesignerQuantities([{ ...first, openings: [{ ...first.openings[0]!, positionMeters: 5.5 }] }], [])).toThrow();
    expect(() => calculateDesignerQuantities([{ ...first, openings: [first.openings[0]!,
      { ...first.openings[0]!, id: randomUUID(), positionMeters: 1.5 }] }], [])).toThrow();
  });
  it("trims an adjoining T-junction without duplicating shared masonry", () => {
    const a = wall({ openings: [] });
    const b = wall({ id: randomUUID(), label: "Wall B", startX: 3, startY: 0,
      endX: 3, endY: 4, openings: [] });
    const result = calculateDesignerQuantities([a, b], [{ id: randomUUID(),
      continuousWallId: a.id, adjoiningWallId: b.id, adjoiningEnd: "START" }]);
    expect(result.issues).toEqual([]);
    expect(result.walls[1]!.junctionDeduction).toBeCloseTo(.3);
    expect(result.totals.masonryVolume).toBeCloseTo((18 + 12 - .3) * .2);
  });
  it("marks undeclared intersections as unresolved", () => {
    const a = wall({ openings: [] });
    const b = wall({ id: randomUUID(), label: "Cross", startX: 3, startY: -1, endX: 3, endY: 1, openings: [] });
    expect(calculateDesignerQuantities([a, b], []).issues.length).toBeGreaterThan(0);
  });
  it("keeps a square corner trimmed and marks cyclic dependencies provisional", () => {
    const first = wall({ openings: [] });
    const second = wall({ id: randomUUID(), label: "Wall B", startX: 6, startY: 0,
      endX: 6, endY: 3, openings: [] });
    const corner = { id: randomUUID(), continuousWallId: first.id,
      adjoiningWallId: second.id, adjoiningEnd: "START" as const };
    const result = calculateDesignerQuantities([first, second], [corner]);
    expect(result.issues).toEqual([]);
    expect(result.totals.junctionDeduction).toBeCloseTo(.3);
    const cyclic = calculateDesignerQuantities([first, second], [corner,
      { id: randomUUID(), continuousWallId: second.id,
        adjoiningWallId: first.id, adjoiningEnd: "END" }]);
    expect(cyclic.issues.some((issue) => issue.includes("Cyclic junction"))).toBe(true);
  });
});
