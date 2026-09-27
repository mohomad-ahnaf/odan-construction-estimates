import { describe, it, expect } from "vitest";
import { totals } from "./totals.js";
import { estimateSchema } from "../validation.js";
describe("estimate arithmetic", () => {
  it("rounds each line before subtotal and applies tax once", () => {
    expect(
      totals(
        [
          { quantity: 3, rate: "0.335" },
          { quantity: 1, rate: "0.335" },
        ],
        18,
      ),
    ).toEqual({
      lines: ["1.01", "0.34"],
      subtotal: "1.35",
      tax: "0.24",
      total: "1.59",
    });
  });
  it("preserves decimal precision for fractional quantities", () => {
    expect(totals([{ quantity: "1.005", rate: "100.00" }], 0).total).toBe(
      "100.50",
    );
  });
  it("rejects tampered totals, missing items and negative rates", () => {
    const valid = {
      clientId: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      estimateDate: "2026-09-27",
      currency: "LKR",
      taxPercent: 18,
      notes: "",
      items: [{ description: "Concrete", unit: "m³", quantity: 2, rate: 100 }],
    };
    expect(estimateSchema.safeParse(valid).success).toBe(true);
    expect(estimateSchema.safeParse({ ...valid, total: 1 }).success).toBe(
      false,
    );
    expect(estimateSchema.safeParse({ ...valid, items: [] }).success).toBe(
      false,
    );
    expect(
      estimateSchema.safeParse({
        ...valid,
        items: [{ ...valid.items[0], rate: -1 }],
      }).success,
    ).toBe(false);
  });
});
