import { expect, it } from "vitest";
import { estimateDescription } from "./estimateDescription";

it("displays source descriptions and falls back without storing a value", () => {
  expect(
    estimateDescription({
      number: "ODN-EST-0001",
      description: "Ground Floor Construction",
    }),
  ).toBe("Ground Floor Construction");
  expect(
    estimateDescription({ number: "ODN-EST-0002", description: null }),
  ).toBe("Estimate ODN-EST-0002");
});
