import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { clientEstimateSchema } from "../client-estimate.validation.js";
import {
  clientEstimateGrandTotal,
  selectedEstimateSnapshot,
} from "./client-estimate-calculation.js";
import {
  clientEstimateExcel,
  renderClientEstimate,
} from "./client-estimate-export.service.js";
import { mandatoryPdfNote } from "./export.service.js";

const source = {
  number: "ODN-EST-0001",
  title: "Foundation work",
  description: "Ground Floor Construction",
  currency: "LKR",
  taxPercent: new Prisma.Decimal(5),
  markupPercent: new Prisma.Decimal(10),
  items: [
    { quantity: new Prisma.Decimal(1), rate: new Prisma.Decimal(100000) },
  ],
};

describe("Client Estimate validation and frozen snapshots", () => {
  const base = {
    clientEstimateDate: "2026-09-28",
    title: "Customer summary",
    notes: "Terms",
    items: [{ sourceEstimateId: "11111111-1111-4111-8111-111111111111" }],
  };
  it("rejects duplicate or missing selections and caller-supplied financial values", () => {
    expect(clientEstimateSchema.safeParse(base).success).toBe(true);
    expect(clientEstimateSchema.safeParse({ ...base, items: [] }).success).toBe(
      false,
    );
    expect(
      clientEstimateSchema.safeParse({
        ...base,
        items: [base.items[0], base.items[0]],
      }).success,
    ).toBe(false);
    expect(
      clientEstimateSchema.safeParse({
        ...base,
        clientEstimateNumber: "CUSTOM",
      }).success,
    ).toBe(false);
    expect(
      clientEstimateSchema.safeParse({ ...base, grandTotalSnapshot: 1 })
        .success,
    ).toBe(false);
    expect(
      clientEstimateSchema.safeParse({
        ...base,
        items: [{ ...base.items[0], amountSnapshot: 1 }],
      }).success,
    ).toBe(false);
  });
  it("uses each source Final Total and preserves snapshots until explicit refresh", () => {
    const saved = selectedEstimateSnapshot(source);
    expect(saved.rateSnapshot.toFixed(2)).toBe("115500.00");
    expect(saved.amountSnapshot.toFixed(2)).toBe("115500.00");
    const changed = {
      ...source,
      title: "Changed source title",
      description: "Electrical Installation",
      items: [
        { quantity: new Prisma.Decimal(1), rate: new Prisma.Decimal(200000) },
      ],
    };
    expect(selectedEstimateSnapshot(changed, saved).descriptionSnapshot).toBe(
      "Ground Floor Construction",
    );
    expect(
      selectedEstimateSnapshot(changed, saved, true).descriptionSnapshot,
    ).toBe("Electrical Installation");
    expect(
      selectedEstimateSnapshot(changed, saved).rateSnapshot.toFixed(2),
    ).toBe("115500.00");
    expect(
      selectedEstimateSnapshot(changed, saved, true).rateSnapshot.toFixed(2),
    ).toBe("231000.00");
    expect(clientEstimateGrandTotal([saved, saved]).toFixed(2)).toBe(
      "231000.00",
    );
  });
  it("snapshots a display fallback for a legacy source without a description", () => {
    const legacy = selectedEstimateSnapshot({
      ...source,
      title: "Project name",
      description: null,
    });
    expect(legacy.descriptionSnapshot).toBe("Estimate ODN-EST-0001");
    expect(legacy.descriptionSnapshot).not.toBe("Project name");
  });
});

it("renders matching customer PDF content and editable Excel formulas", async () => {
  const snapshot = selectedEstimateSnapshot(source);
  const record = {
    id: "test",
    clientEstimateNumber: "ODN-CE-0001",
    projectId: "project",
    clientId: "client",
    clientNameSnapshot: "Customer",
    clientNumberSnapshot: "ODN-CLI-0001",
    projectNameSnapshot: "Residence",
    projectCodeSnapshot: "ODN-PRJ-0001",
    clientEstimateDate: new Date("2026-09-28T00:00:00Z"),
    title: "Customer summary",
    currency: "LKR",
    status: "DRAFT",
    version: 1,
    notes: "Terms",
    grandTotalSnapshot: new Prisma.Decimal(231000),
    createdById: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [0, 1].map((position) => ({
      id: String(position),
      clientEstimateId: "test",
      sourceEstimateId: String(position),
      position,
      ...snapshot,
      quantity: new Prisma.Decimal(1),
      createdAt: new Date(),
    })),
  } as never;
  const html = renderClientEstimate(record);
  expect(html).toContain("CLIENT ESTIMATE");
  expect(html).toContain("ODN-CE-0001");
  expect(html).toContain("231,000.00");
  expect(html.match(/ODN-EST-0001/g) ?? []).toHaveLength(2);
  expect(html.match(/Ground Floor Construction/g) ?? []).toHaveLength(2);
  expect(html).toContain(mandatoryPdfNote);
  expect(html).toContain("display:table-header-group");
  const bytes = await clientEstimateExcel(record);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  const sheet = workbook.getWorksheet("Client Estimate")!;
  expect(sheet.getCell("F13").value).toEqual({
    formula: "ROUND(D13*E13,2)",
    result: 115500,
  });
  expect(sheet.getCell("B13").value).toBe("ODN-EST-0001");
  expect(sheet.getCell("B14").value).toBe("ODN-EST-0001");
  expect(sheet.getCell("C13").value).toBe("Ground Floor Construction");
  expect(sheet.getCell("C14").value).toBe("Ground Floor Construction");
  expect(sheet.getCell("F14").value).toEqual({
    formula: "ROUND(D14*E14,2)",
    result: 115500,
  });
  expect(sheet.getCell("F16").value).toEqual({
    formula: "SUM(F13:F14)",
    result: 231000,
  });
  expect(sheet.getCell("B16").value).toBe("Grand Total (LKR)");
  expect(sheet.pageSetup.paperSize).toBe(9);
  expect(sheet.pageSetup.orientation).toBe("portrait");
  expect(sheet.pageSetup.printTitlesRow).toBe("12:12");
  expect(sheet.getImages()).toHaveLength(1);
});
