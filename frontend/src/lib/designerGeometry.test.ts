import { describe, expect, it } from "vitest";
import type { DesignerWall } from "../types";
import { modelDistance, projectToWall, resizedWall, snapModelPoint, wallSolidBands } from "./designerGeometry";
import { calculateDesignerQuantities } from "./designerQuantities";

const wall: DesignerWall = { id: "a", label: "Wall A", startX: 0, startY: 0, endX: 6, endY: 0,
  heightMeters: 3, thicknessMeters: .2, alignment: "CENTRELINE",
  faces: ["A", "B"].map((side) => ({ side, roomName: null, plaster: true,
    plasterHeightMeters: 3, paint: true, paintHeightMeters: 3 })) as DesignerWall["faces"],
  openings: [{ id: "door", type: "DOOR", label: "Door", positionMeters: 1,
    widthMeters: 1, heightMeters: 2, sillMeters: 0 }] };

describe("standalone designer geometry", () => {
  it("makes a real door void and uses canonical dimensions for quantity preview", () => {
    const bands = wallSolidBands(wall);
    expect(bands.some((band) => band.start === 1 && band.end === 2 && band.bottom === 0)).toBe(false);
    expect(bands.some((band) => band.start === 1 && band.end === 2 && band.bottom === 2 && band.top === 3)).toBe(true);
    expect(calculateDesignerQuantities([wall], []).totals.masonryVolume).toBeCloseTo(3.2);
  });
  it("keeps snapping, exact length editing, and wall projection in metres", () => {
    const resized = resizedWall(wall, 7.5);
    expect(modelDistance({ x: resized.startX, y: resized.startY }, { x: resized.endX, y: resized.endY })).toBe(7.5);
    expect(projectToWall(wall, { x: 2, y: .1 })).toBe(2);
    expect(snapModelPoint({ x: 6.1, y: .1 }, null, [wall], { endpoints: true, axis: false }, .2).point).toEqual({ x: 6, y: 0 });
  });
  it("switches display units without mutating canonical quantities", () => {
    const canonical = calculateDesignerQuantities([wall], []).totals.masonryVolume;
    const imperial = canonical / (.3048 ** 3);
    expect(imperial).toBeCloseTo(113.006, 2);
    expect(calculateDesignerQuantities([wall], []).totals.masonryVolume).toBe(canonical);
  });
});
