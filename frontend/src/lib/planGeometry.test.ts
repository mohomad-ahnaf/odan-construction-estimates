import { describe, expect, it } from "vitest";
import {
  clientToPagePoint,
  clientToRotatedPagePoint,
  fitPlanScale,
  planCanvasRenderMetrics,
  pageDistance,
  pagePolygonArea,
} from "./planGeometry";

describe("plan coordinate geometry", () => {
  it("keeps page coordinates invariant across zoom, pan and resize", () => {
    const original = clientToPagePoint(250, 175, { left: 50, top: 25, width: 400, height: 300 }, 1000, 500);
    const transformed = clientToPagePoint(500, 350, { left: 100, top: 50, width: 800, height: 600 }, 1000, 500);
    expect(transformed).toEqual(original);
    expect(pageDistance({ x: 0, y: 0 }, original)).toBeCloseTo(
      pageDistance({ x: 0, y: 0 }, transformed),
      10,
    );
  });

  it("preserves dimensions and areas for PDF pages with different aspect ratios", () => {
    expect(fitPlanScale(1000, 700, 1000, 500)).toBeCloseTo(0.952, 3);
    expect(fitPlanScale(1000, 700, 500, 1000)).toBeCloseTo(0.652, 3);
    expect(pagePolygonArea([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ])).toBe(20000);
  });

  it("inverse-maps every view rotation to the same unrotated page point", () => {
    const expected = { x: 250, y: 125 };
    expect(clientToRotatedPagePoint(100, 50, { left: 0, top: 0, width: 400, height: 200 }, 1000, 500, 0)).toEqual(expected);
    expect(clientToRotatedPagePoint(300, 250, { left: 0, top: 0, width: 400, height: 1000 }, 1000, 500, 90)).toEqual(expected);
    expect(clientToRotatedPagePoint(300, 150, { left: 0, top: 0, width: 400, height: 200 }, 1000, 500, 180)).toEqual(expected);
    expect(clientToRotatedPagePoint(100, 750, { left: 0, top: 0, width: 400, height: 1000 }, 1000, 500, 270)).toEqual(expected);
  });

  it("renders zoomed PDF pages at display resolution while limiting large canvases", () => {
    expect(planCanvasRenderMetrics(1000, 500, 2)).toMatchObject({
      outputScale: 2,
      pixelWidth: 2000,
      pixelHeight: 1000,
    });
    expect(planCanvasRenderMetrics(2000, 1000, 2)).toMatchObject({
      outputScale: 2,
      pixelWidth: 4000,
      pixelHeight: 2000,
    });

    const limited = planCanvasRenderMetrics(15_000, 10_000, 2);
    expect(limited.pixelWidth).toBeLessThanOrEqual(8192);
    expect(limited.pixelHeight).toBeLessThanOrEqual(8192);
    expect(limited.pixelWidth * limited.pixelHeight).toBeLessThanOrEqual(32_000_000);
  });
});
