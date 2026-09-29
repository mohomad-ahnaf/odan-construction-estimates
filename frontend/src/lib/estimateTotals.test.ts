import { expect, it } from "vitest";
import { previewEstimateTotals } from "./estimateTotals";

it("previews markup before tax with the same half-up cent rounding as the API", () => {
  expect(previewEstimateTotals([{ quantity: 1, rate: 100000 }], 10, 5)).toEqual(
    {
      baseSubtotal: "100000.00",
      markupAmount: "10000.00",
      subtotalAfterMarkup: "110000.00",
      tax: "5500.00",
      total: "115500.00",
    },
  );
  expect(
    previewEstimateTotals([{ quantity: 1.005, rate: 100 }], 0, 0)?.total,
  ).toBe("100.50");
  expect(previewEstimateTotals([{ quantity: 0, rate: 100 }], 10, 5)).toBeNull();
  expect(previewEstimateTotals([{ quantity: 1, rate: -1 }], 10, 5)).toBeNull();
  expect(
    previewEstimateTotals([{ quantity: 1, rate: 100 }], 100.001, 5),
  ).toBeNull();
});
