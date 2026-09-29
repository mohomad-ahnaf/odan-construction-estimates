import { expect, it } from "vitest";
import { sumClientEstimateAmounts } from "./clientEstimateTotals";

it("adds saved Client Estimate row amounts without floating-point loss", () => {
  expect(sumClientEstimateAmounts(["115500.00", "0.01", "4.99"])).toBe(
    "115505.00",
  );
  expect(sumClientEstimateAmounts(["999999999999999.99", "0.01"])).toBe(
    "1000000000000000.00",
  );
  expect(sumClientEstimateAmounts([])).toBe("0.00");
});
