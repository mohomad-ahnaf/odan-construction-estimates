import { expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { defaultPdfTemplateSettings, parsePdfTemplateSettings } from "./pdf-template-settings.service.js";
import { loadPdfLogo, renderEstimate } from "./export.service.js";

const sample = {
  number: "ODN-EST-TEST",
  title: "Sample Project",
  description: "Sample scope",
  client: { clientCode: "ODN-CLI-TEST" },
  projectCodeSnapshot: "ODN-PRJ-TEST",
  estimateDate: new Date("2026-01-01T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  currency: "LKR",
  markupPercent: new Prisma.Decimal(0),
  taxPercent: new Prisma.Decimal(0),
  notes: "Estimate notes",
  items: [{ description: "Concrete", unit: "m²", quantity: new Prisma.Decimal(1), rate: new Prisma.Decimal(100) }],
} as never;

it("validates and sanitizes PDF settings and rejects invalid logo bytes", () => {
  const settings = parsePdfTemplateSettings({
    ...defaultPdfTemplateSettings,
    companyName: "  Example\u0000 Company  ",
    termsConditions: "  First line\r\nSecond line  ",
  });
  expect(settings.companyName).toBe("Example Company");
  expect(settings.termsConditions).toBe("First line\nSecond line");
  expect(() => parsePdfTemplateSettings({ ...settings, primaryColor: "red" })).toThrow();
  expect(() => parsePdfTemplateSettings({ ...settings, logoDataUrl: "data:image/png;base64,AAAA" })).toThrow("Invalid logo image");
  expect(() => parsePdfTemplateSettings({ ...settings, extraField: "ignored?" })).toThrow();
});

it("renders customized settings without changing estimate values", () => {
  const logoDataUrl = `data:image/png;base64,${loadPdfLogo()}`;
  const settings = parsePdfTemplateSettings({
    ...defaultPdfTemplateSettings,
    companyName: "Sample & Sons",
    documentTitle: "Custom <Estimate>",
    termsConditions: "Valid for 30 days.",
    primaryColor: "#123456",
    accentColor: "#ABCDEF",
    fontFamily: "Inter",
    headerLayout: "RIGHT",
    watermarkEnabled: false,
    tableStyle: "LIGHT_GRAY",
    logoDataUrl,
  });
  const html = renderEstimate(sample, true, true, settings);
  expect(html).toContain("Custom &lt;Estimate&gt;");
  expect(html).toContain("Sample &amp; Sons");
  expect(html).toContain("Valid for 30 days.");
  expect(html).toContain("header{flex-direction:row-reverse}");
  expect(html).toContain("background:#E8ECEE");
  expect(html).toContain("data:font/woff2;base64,");
  expect(html).not.toContain('class="watermark"');
  expect(html).toContain("100.00");
});
