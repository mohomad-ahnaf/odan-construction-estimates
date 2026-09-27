import { it, expect } from "vitest";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { escapeHtml, renderEstimate, xlsx } from "./export.service.js";
const estimate = {
  id: "test",
  number: "OD-TEST",
  title: "<script>alert(1)</script>",
  clientName: '=HYPERLINK("evil")',
  clientEmail: null,
  siteAddress: "Address",
  currency: "LKR",
  taxPercent: new Prisma.Decimal(18),
  notes: "Terms",
  status: "DRAFT" as const,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    {
      id: "item",
      estimateId: "test",
      position: 0,
      description: '<img src="http://evil">',
      unit: "m²",
      quantity: new Prisma.Decimal(2),
      rate: new Prisma.Decimal(100),
    },
  ],
};
it("escapes untrusted PDF text", () => {
  expect(escapeHtml("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;");
  expect(renderEstimate(estimate)).not.toContain("<script>");
  expect(renderEstimate(estimate)).not.toContain("<img");
});
it("creates formula-enabled Excel with untrusted client text as a string", async () => {
  const data = await xlsx(estimate);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data as never);
  const sheet = book.getWorksheet("Estimate")!;
  expect(sheet.getCell("E8").value).toEqual({
    formula: "ROUND(C8*D8,2)",
    result: 200,
  });
  expect(sheet.getCell("E11").value).toEqual({
    formula: "E9+E10",
    result: 236,
  });
  expect(sheet.getCell("A4").type).toBe(ExcelJS.ValueType.String);
});
