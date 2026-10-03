import { describe, expect, it } from "vitest";
import type { DesignerWall } from "../types";
import { calculateDesignerQuantities } from "./designerQuantities";
import { connectionTarget, createsTrimCycle, findWallSnap, plannedConnections } from "./designerConnections";

const wall = (id: string, startX: number, startY: number, endX: number, endY: number): DesignerWall => ({
  id, label: `Wall ${id}`, startX, startY, endX, endY, heightMeters: 3, thicknessMeters: .2,
  alignment: "CENTRELINE", openings: [], faces: ["A", "B"].map((side) => ({ side, roomName: null,
    plaster: true, plasterHeightMeters: 3, paint: true, paintHeightMeters: 3 })) as DesignerWall["faces"],
});
const screen = (p: { x: number; y: number }) => ({ x: p.x * 100, y: p.y * 100 });
const main = wall("a", 0, 0, 6, 0);

describe("intentional designer wall connections", () => {
  it("snaps a square T-junction and uses the through wall as continuous", () => {
    const hit = findWallSnap({ x: 3, y: .08 }, [main], screen, screen({ x: 3, y: .08 }));
    expect(hit?.point).toEqual({ x: 3, y: 0 });
    const adjoining = wall("b", 3, 0, 3, 4);
    const planned = plannedConnections(adjoining, [main], [], { START: hit, END: null }, () => "j1");
    expect(planned.warnings).toEqual([]);
    expect(planned.junctions).toEqual([{ id: "j1", continuousWallId: "a", adjoiningWallId: "b", adjoiningEnd: "START" }]);
    const quantity = calculateDesignerQuantities([main, adjoining], planned.junctions);
    expect(quantity.issues).toEqual([]);
    expect(quantity.totals.junctionDeduction).toBeCloseTo(.3);
    expect(quantity.totals.masonryVolume).toBeCloseTo((18 + 12 - .3) * .2);
    expect(quantity.totals.plasterArea).toBeCloseTo((18 + 12 - .3) * 2);
    expect(plannedConnections(adjoining, [main], planned.junctions, { START: hit, END: null }, () => "j2").junctions)
      .toEqual(planned.junctions);
  });
  it("joins a square corner deterministically and rejects unsupported or distant targets", () => {
    const hit = findWallSnap({ x: 6.05, y: .02 }, [main], screen, screen({ x: 6.05, y: .02 }));
    const corner = wall("b", 6, 0, 6, 3);
    expect(plannedConnections(corner, [main], [], { START: hit, END: null }, () => "j").junctions[0]?.continuousWallId).toBe("a");
    const diagonal = wall("c", 6, 0, 8, 2);
    expect(connectionTarget(diagonal, "START", hit, [main]).warning).toMatch(/square/);
    expect(connectionTarget(wall("d", 6.5, 0, 6.5, 3), "START", hit, [main]).warning).toMatch(/no longer/);
    expect(findWallSnap({ x: 3, y: 1 }, [main], screen, screen({ x: 3, y: 1 }))).toBeNull();
  });
  it("requires an explicit choice when multiple valid targets meet and prevents trim cycles", () => {
    const second = wall("b", 0, 0, -4, 0);
    const hit = findWallSnap({ x: 0, y: 0 }, [main, second], screen, screen({ x: 0, y: 0 }));
    const upright = wall("c", 0, 0, 0, 3);
    expect(connectionTarget(upright, "START", hit, [main, second]).ambiguous).toBe(true);
    const chosen = { ...hit!, chosenWallId: "a" };
    expect(connectionTarget(upright, "START", chosen, [main, second]).candidate?.wallId).toBe("a");
    const cycle = [{ id: "one", continuousWallId: "b", adjoiningWallId: "a", adjoiningEnd: "START" as const },
      { id: "two", continuousWallId: "a", adjoiningWallId: "b", adjoiningEnd: "START" as const }];
    expect(createsTrimCycle(cycle)).toBe(true);
  });
  it("disconnects without deleting geometry and only reconnects after a new snap intent", () => {
    const adjoining = wall("b", 3, 0, 3, 4);
    const hit = findWallSnap({ x: 3, y: 0 }, [main], screen, screen({ x: 3, y: 0 }));
    const joined = plannedConnections(adjoining, [main], [], { START: hit, END: null }, () => "j");
    const disconnected = joined.junctions.filter((item) => item.id !== "j");
    expect(disconnected).toEqual([]);
    expect(plannedConnections(adjoining, [main], disconnected, { START: null, END: null }, () => "other").junctions).toEqual([]);
    expect(plannedConnections(adjoining, [main], disconnected, { START: hit, END: null }, () => "other").junctions).toHaveLength(1);
  });
});
