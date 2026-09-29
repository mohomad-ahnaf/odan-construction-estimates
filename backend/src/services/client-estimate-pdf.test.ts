import { expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { renderClientEstimate } from "./client-estimate-export.service.js";
import { mandatoryPdfNote } from "./export.service.js";

const record = {
  clientEstimateNumber: "ODN-CE-TEST",
  clientEstimateDate: new Date("2026-09-28T00:00:00.000Z"),
  clientNameSnapshot: "Fictional Client",
  clientNumberSnapshot: "ODN-CLI-TEST",
  projectNameSnapshot: "Fictional Project",
  projectCodeSnapshot: "ODN-PRJ-TEST",
  title: "A long client estimate description for wrapping review",
  currency: "LKR",
  status: "DRAFT",
  notes: "Illustrative terms only.",
  grandTotalSnapshot: new Prisma.Decimal(250000),
  items: [
    {
      estimateNumberSnapshot: "ODN-EST-TEST",
      descriptionSnapshot: "Illustrative construction work with a long description that should wrap inside the table cell.",
      rateSnapshot: new Prisma.Decimal(250000),
      amountSnapshot: new Prisma.Decimal(250000),
    },
  ],
} as never;

it("renders the Client Estimate with matching branding, watermark and print-friendly sections", () => {
  const html = renderClientEstimate(record);
  expect(html.match(/src="data:image\/png;base64,/g)).toHaveLength(2);
  expect(html).toContain('class="watermark"');
  expect(html).toContain("opacity:.045");
  expect(html).toContain("Client Estimate</h1>");
  expect(html).toContain("odanconstruction@gmail.com");
  expect(html).toContain("077 811 9382");
  expect(html).toContain("19B, Sujatha Avenue, Dehiwala");
  expect(html).not.toContain('<div class="company-name">ODAN CONSTRUCTION</div>');
  for (const value of [
    "ODN-CLI-TEST",
    "Fictional Project",
    "ODN-PRJ-TEST",
    "ODN-EST-TEST",
    "250,000.00",
    "Illustrative terms only.",
    mandatoryPdfNote,
  ]) expect(html).toContain(value);
  const metadata = html.match(/<section class="metadata">(.+?)<\/section>/s)?.[1];
  expect([...metadata!.matchAll(/class="detail-label">([^<]+)</g)].map((match) => match[1])).toEqual([
    "Estimate Number", "Description", "Client Number",
    "Estimate Date", "Currency", "Project", "Project Code",
  ]);
  expect(metadata).not.toContain("Fictional Client");
  expect(metadata).not.toContain("DRAFT");
  expect(html).toContain("size:A4 portrait");
  expect(html).toContain("display:table-header-group");
  expect(html).toContain("border-bottom:1px solid #D8DEDF");
  expect(html).toContain("background:#F8F6EF");
  expect(html.indexOf("Grand Total (LKR)")).toBeLessThan(html.indexOf("Terms / Notes"));
});

it("keeps a text header and valid PDF markup when both images are unavailable", () => {
  const html = renderClientEstimate(record, false, false);
  expect(html).toContain('<div class="company-name">ODAN CONSTRUCTION</div>');
  expect(html).not.toContain('class="watermark"');
  expect(html).not.toContain('src="data:image/png;base64,');
  expect(html).toContain("Grand Total (LKR)");
});
