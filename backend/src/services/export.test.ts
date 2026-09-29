import { it, expect } from "vitest";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import {
  escapeHtml,
  loadPdfLogo,
  loadPdfWatermark,
  mandatoryPdfNote,
  renderEstimate,
  xlsx,
} from "./export.service.js";
it("uses the PNG logo and falls back safely for missing or unsupported assets", () => {
  expect(loadPdfLogo()).toBeTruthy();
  expect(
    loadPdfLogo(new URL("./missing-brand.png", import.meta.url)),
  ).toBeNull();
  expect(loadPdfLogo(new URL("./export.test.ts", import.meta.url))).toBeNull();
});
it("loads the transparent logo as watermark and tolerates an unavailable asset", () => {
  expect(loadPdfWatermark()).toBe(loadPdfLogo());
  expect(
    loadPdfWatermark(new URL("./missing-watermark.png", import.meta.url)),
  ).toBeNull();
});
const estimate = {
  id: "test",
  number: "OD-TEST",
  title: "<script>alert(1)</script>",
  description: null,
  clientName: '=HYPERLINK("evil")',
  clientEmail: null,
  client: { clientCode: "ODN-CLI-0042", address: "Short client address" },
  clientRegistrationNumberSnapshot: "REG-123",
  clientVatNumberSnapshot: "VAT-456",
  projectCodeSnapshot: "PRJ-789",
  siteAddress: "Site-only address",
  currency: "LKR",
  markupPercent: new Prisma.Decimal(10),
  taxPercent: new Prisma.Decimal(5),
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
      quantity: new Prisma.Decimal(1),
      rate: new Prisma.Decimal(100000),
    },
  ],
};
it("escapes untrusted PDF text", () => {
  expect(escapeHtml("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;");
  expect(renderEstimate(estimate)).not.toContain("<script>");
  expect(renderEstimate(estimate)).not.toContain('<img src="http://evil">');
  expect(renderEstimate(estimate)).toContain('src="data:image/png;base64,');
  expect(renderEstimate(estimate).match(/src="data:image\/png;base64,/g)).toHaveLength(2);
  expect(renderEstimate(estimate)).not.toContain(
    '<div class="company-name">ODAN CONSTRUCTION</div>',
  );
  expect(renderEstimate(estimate, false)).not.toContain(
    '<div class="company"><img',
  );
  expect(renderEstimate(estimate, false)).toContain(
    '<div class="company-name">ODAN CONSTRUCTION</div>',
  );
  expect(renderEstimate(estimate, true, false)).not.toContain(
    'class="watermark"',
  );
  expect(renderEstimate(estimate, false)).toContain(mandatoryPdfNote);
  expect(renderEstimate(estimate)).toContain("Project Code");
  expect(renderEstimate(estimate)).toContain("PRJ-789");
  expect(renderEstimate(estimate)).toContain("Estimate OD-TEST");
  expect(renderEstimate(estimate)).toContain("Client Number");
  expect(renderEstimate(estimate)).toContain("ODN-CLI-0042");
  expect(renderEstimate(estimate)).not.toContain("Short client address");
  expect(renderEstimate(estimate)).not.toContain("Site-only address");
  expect(renderEstimate(estimate)).not.toContain(estimate.clientName);
  expect(renderEstimate(estimate)).not.toContain('<span class="detail-label">Status</span>');
  expect(renderEstimate(estimate)).not.toContain("DRAFT");
  expect(renderEstimate(estimate)).not.toContain('<span class="detail-label">Client Email</span>');
  expect(renderEstimate(estimate)).toContain("odanconstruction@gmail.com");
  expect(renderEstimate(estimate)).toContain("077 811 9382");
  expect(renderEstimate(estimate)).toContain("19B, Sujatha Avenue, Dehiwala");
  expect(renderEstimate(estimate)).toContain(
    "grid-template-columns:repeat(2,minmax(0,1fr))",
  );
  expect(renderEstimate(estimate)).toContain(".items{margin-top:20px}");
  expect(renderEstimate(estimate)).toContain("opacity:.045");
  expect(renderEstimate(estimate)).toContain("width:112mm;height:58mm");
  const html = renderEstimate(estimate);
  for (const value of [
    "100,000.00",
    "10,000.00",
    "110,000.00",
    "5,500.00",
    "115,500.00",
  ])
    expect(html).toContain(value);
  expect(html.indexOf("Base Subtotal")).toBeLessThan(
    html.indexOf("Markup</td>"),
  );
  expect(html.indexOf("Markup</td>")).toBeLessThan(
    html.indexOf("Subtotal After Markup"),
  );
  expect(html.indexOf("Terms / Notes")).toBeLessThan(
    html.indexOf("Prepared by / Signature"),
  );
  expect(html.indexOf("Prepared by / Signature")).toBeLessThan(
    html.indexOf(mandatoryPdfNote),
  );
  expect(renderEstimate(estimate)).toContain(mandatoryPdfNote);
  expect(renderEstimate(estimate)).not.toContain("VAT-456");
  expect(renderEstimate(estimate)).not.toContain("REG-123");
});
it("places a separate description near the number in individual exports", async () => {
  const described = { ...estimate, description: "Ground Floor Construction" };
  const html = renderEstimate(described);
  expect(html).toContain('<span class="detail-label">Description</span>');
  expect(html).toContain("Ground Floor Construction");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await xlsx(described)) as never);
  expect(workbook.getWorksheet("Estimate")!.getCell("C9").value).toBe(
    "Ground Floor Construction",
  );
});
it("creates formula-enabled Excel with untrusted client text as a string", async () => {
  const data = await xlsx(estimate);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data as never);
  const sheet = book.getWorksheet("Estimate")!;
  expect(sheet.getCell("C9").value).toBe("Estimate OD-TEST");
  expect(sheet.getCell("F15").value).toEqual({
    formula: "ROUND(D15*E15,2)",
    result: 100000,
  });
  expect(sheet.getCell("F17").value).toEqual({
    formula: "SUM(F15:F15)",
    result: 100000,
  });
  expect(sheet.getCell("F18").value).toEqual({
    formula: "ROUND(F17*D18,2)",
    result: 10000,
  });
  expect(sheet.getCell("F19").value).toEqual({
    formula: "F17+F18",
    result: 110000,
  });
  expect(sheet.getCell("F20").value).toEqual({
    formula: "ROUND(F19*D20,2)",
    result: 5500,
  });
  expect(sheet.getCell("F21").value).toEqual({
    formula: "F19+F20",
    result: 115500,
  });
  expect(sheet.getCell("D18").numFmt).toBe("0.00%");
  expect(sheet.getCell("D20").numFmt).toBe("0.00%");
  expect(sheet.getCell("D15").numFmt).toBe("#,##0.###");
  expect(sheet.getCell("E15").numFmt).toBe("#,##0.00");
  expect(sheet.getCell("F21").numFmt).toBe("#,##0.00");
  expect(sheet.getCell("C8").type).toBe(ExcelJS.ValueType.String);
  expect(sheet.getCell("E8").value).toBe("Client Number");
  expect(sheet.getCell("F8").value).toBe("ODN-CLI-0042");
  expect(sheet.getCell("F10").value).toBe("PRJ-789");
  expect(sheet.getCell("B28").value).toBe(mandatoryPdfNote);
  expect(sheet.getImages()).toHaveLength(1);
  expect(sheet.pageSetup.paperSize).toBe(9);
  expect(sheet.pageSetup.orientation).toBe("portrait");
  expect(sheet.pageSetup.printTitlesRow).toBe("14:14");
  expect(sheet.pageSetup.printArea).toBe("A1:F28");
  expect(sheet.headerFooter.oddFooter).toContain("&P of &N");
});
