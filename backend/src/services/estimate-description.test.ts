import { expect, it } from "vitest";
import { estimateSchema, updateSchema } from "../validation.js";
import { estimateDescription } from "./estimate-description.js";

const payload = {
  clientId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  estimateDate: "2026-09-28",
  currency: "LKR",
  markupPercent: 0,
  taxPercent: 0,
  notes: "",
  items: [{ description: "Work", unit: "item", quantity: 1, rate: 100 }],
};

it("requires a meaningful, trimmed description of at most 150 characters on create", () => {
  expect(estimateSchema.safeParse(payload).success).toBe(false);
  expect(
    estimateSchema.safeParse({ ...payload, description: "   " }).success,
  ).toBe(false);
  expect(
    estimateSchema.safeParse({ ...payload, description: "x".repeat(151) })
      .success,
  ).toBe(false);
  expect(
    estimateSchema.parse({
      ...payload,
      description: "  Electrical Installation  ",
    }).description,
  ).toBe("Electrical Installation");
});

it("permits an omitted legacy description on update but rejects an explicit blank value", () => {
  expect(updateSchema.safeParse({ ...payload, version: 1 }).success).toBe(true);
  expect(
    updateSchema.safeParse({ ...payload, version: 1, description: "  " })
      .success,
  ).toBe(false);
  expect(
    updateSchema.parse({
      ...payload,
      version: 1,
      description: "  Painting Work  ",
    }).description,
  ).toBe("Painting Work");
});

it("shows a display-only fallback for legacy records", () => {
  expect(
    estimateDescription({ number: "ODN-EST-0001", description: null }),
  ).toBe("Estimate ODN-EST-0001");
  expect(
    estimateDescription({ number: "ODN-EST-0001", description: "Roofing" }),
  ).toBe("Roofing");
});
