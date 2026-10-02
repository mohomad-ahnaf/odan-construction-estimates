import { describe, expect, it } from "vitest";
import {
  convertMetricQuantity,
  draftQuantityInMetric,
  formatPlanQuantity,
  measurementDraftComplete,
  measurementTotals,
} from "./planMeasurementDisplay";

describe("plan measurement display", () => {
  it("converts metric quantities for display without changing the source value", () => {
    const metres = 3.048;
    const squareMetres = 9.290304;
    expect(convertMetricQuantity("LENGTH", metres, "IMPERIAL")).toBeCloseTo(10, 10);
    expect(convertMetricQuantity("AREA", squareMetres, "IMPERIAL")).toBeCloseTo(100, 10);
    expect(metres).toBe(3.048);
    expect(squareMetres).toBe(9.290304);
    expect(formatPlanQuantity("LENGTH", metres, "METRIC")).toBe("3.048 m");
    expect(formatPlanQuantity("AREA", squareMetres, "IMPERIAL")).toBe("100.00 ft²");
  });

  it("keeps count groups unchanged", () => {
    expect(convertMetricQuantity("COUNT", 7, "IMPERIAL")).toBe(7);
    expect(formatPlanQuantity("COUNT", 7, "IMPERIAL")).toBe("7 count");
  });

  it("calculates completed drafts in metric base units", () => {
    const line = [{ x: 0, y: 0 }, { x: 30, y: 40 }];
    const area = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(measurementDraftComplete("LENGTH", line)).toBe(true);
    expect(measurementDraftComplete("AREA", area.slice(0, 2))).toBe(false);
    expect(draftQuantityInMetric("LENGTH", line, 0.1)).toBeCloseTo(5, 10);
    expect(draftQuantityInMetric("AREA", area, 0.1)).toBeCloseTo(1, 10);
    expect(draftQuantityInMetric("COUNT", area, null)).toBe(4);
  });

  it("totals saved measurement types and count labels independently at full precision", () => {
    const totals = measurementTotals([
      { type: "LENGTH", label: "Wall A", quantity: "3.0480000000" },
      { type: "LENGTH", label: "Wall B", quantity: "2.0000000001" },
      { type: "AREA", label: "Floor", quantity: "9.2903040000" },
      { type: "COUNT", label: "Doors", quantity: "2.0000000000" },
      { type: "COUNT", label: "Windows", quantity: "3.0000000000" },
    ]);
    expect(totals.length).toBeCloseTo(5.0480000001, 10);
    expect(totals.area).toBeCloseTo(9.290304, 10);
    expect(totals.count).toBe(5);
    expect(totals.counts).toEqual({ Doors: 2, Windows: 3 });
  });
});
