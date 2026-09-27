import ExcelJS from "exceljs";
import puppeteer from "puppeteer";
import { createRequire } from "node:module";
import { totals } from "./totals.js";
import type { getEstimate } from "./estimate.service.js";
type Estimate = Awaited<ReturnType<typeof getEstimate>>;
const require = createRequire(import.meta.url);
export const escapeHtml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function renderEstimate(estimate: Estimate) {
  const calculated = totals(estimate.items, estimate.taxPercent);
  const e = escapeHtml;
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm 16mm 22mm}body{font:11px Arial,sans-serif;color:#18352d}header{border-bottom:3px solid #b99850;padding-bottom:18px}h1{font-size:26px;margin-bottom:6px}.muted{color:#60746c}section{margin:22px 0}table{width:100%;border-collapse:collapse}th{background:#18352d;color:white;text-align:left}td,th{padding:9px 7px;border-bottom:1px solid #dce3df}.num{text-align:right}tr{break-inside:avoid}thead{display:table-header-group}.summary{width:45%;margin:20px 0 20px auto}.notes{white-space:pre-wrap;overflow-wrap:anywhere}td{overflow-wrap:anywhere}footer{font-size:10px;color:#60746c}</style></head><body><header><div>ODAN CONSTRUCTION</div><h1>Construction estimate</h1><div>${e(estimate.number)} · ${e(estimate.status)} · ${e(estimate.currency)}</div></header><section><h2>${e(estimate.title)}</h2><strong>${e(estimate.clientName)}</strong><p>${e(estimate.clientEmail ?? "")}</p><p>${e(estimate.siteAddress)}</p><span class="muted">Estimate date ${(estimate.estimateDate ?? estimate.createdAt).toISOString().slice(0, 10)}</span></section><table><thead><tr><th>Description</th><th>Unit</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${estimate.items.map((item, index) => `<tr><td>${e(item.description)}</td><td>${e(item.unit)}</td><td class="num">${e(item.quantity)}</td><td class="num">${Number(item.rate).toFixed(2)}</td><td class="num">${calculated.lines[index]}</td></tr>`).join("")}</tbody></table><table class="summary"><tr><td>Subtotal</td><td class="num">${calculated.subtotal}</td></tr><tr><td>Tax (${e(estimate.taxPercent)}%)</td><td class="num">${calculated.tax}</td></tr><tr><td><strong>Total ${e(estimate.currency)}</strong></td><td class="num"><strong>${calculated.total}</strong></td></tr></table><section class="notes">${e(estimate.notes)}</section><footer>Odan Construction · Estimate Management System</footer></body></html>`;
}
export async function pdf(estimate: Estimate) {
  const { executablePath } = require("../../../.puppeteerrc.cjs");
  if (!executablePath)
    throw new Error("Project browser missing. Run npm run browser:install.");
  const browser = await puppeteer.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => void request.abort());
    await page.setContent(renderEstimate(estimate), {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    return Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font-size:9px;width:100%;text-align:center;color:#677">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        margin: { top: "18mm", bottom: "22mm", left: "16mm", right: "16mm" },
      }),
    );
  } finally {
    await browser.close();
  }
}
export async function xlsx(estimate: Estimate) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Odan Construction";
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet("Estimate", {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.columns = [
    { width: 54 },
    { width: 12 },
    { width: 16 },
    { width: 20 },
    { width: 22 },
  ];
  sheet.addRow(["ODAN CONSTRUCTION"]);
  sheet.addRow([estimate.title]);
  sheet.addRow([
    estimate.number,
    estimate.status,
    estimate.currency,
    "Estimate date",
    (estimate.estimateDate ?? estimate.createdAt).toISOString().slice(0, 10),
  ]);
  sheet.addRow([estimate.clientName]);
  sheet.addRow([estimate.siteAddress]);
  sheet.addRow([]);
  sheet.addRow(["Description", "Unit", "Quantity", "Rate", "Amount"]);
  const calculated = totals(estimate.items, estimate.taxPercent);
  estimate.items.forEach((item, index) => {
    const row = 8 + index;
    sheet.addRow([
      item.description,
      item.unit,
      Number(item.quantity),
      Number(item.rate),
      {
        formula: `ROUND(C${row}*D${row},2)`,
        result: Number(calculated.lines[index]),
      },
    ]);
  });
  const last = 7 + estimate.items.length;
  const subtotal = last + 1;
  const tax = last + 2;
  sheet.addRow([
    "Subtotal",
    "",
    "",
    "",
    { formula: `SUM(E8:E${last})`, result: Number(calculated.subtotal) },
  ]);
  sheet.addRow([
    "Tax",
    Number(estimate.taxPercent) / 100,
    "",
    "",
    {
      formula: `ROUND(E${subtotal}*B${tax},2)`,
      result: Number(calculated.tax),
    },
  ]);
  sheet.getCell(`B${tax}`).numFmt = "0.00%";
  sheet.addRow([
    `Total (${estimate.currency})`,
    "",
    "",
    "",
    { formula: `E${subtotal}+E${tax}`, result: Number(calculated.total) },
  ]);
  sheet.addRow([]);
  sheet.addRow([estimate.notes]);
  sheet.getColumn(4).numFmt = "#,##0.00";
  sheet.getColumn(5).numFmt = "#,##0.00";
  sheet.getColumn(3).numFmt = "#,##0.###";
  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  for (const n of [1, 7, last + 3]) {
    sheet.getRow(n).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(n).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF18352D" },
    };
    sheet.getRow(n).height = 28;
  }
  sheet.views = [{ state: "frozen", ySplit: 7 }];
  sheet.pageSetup.printTitlesRow = "1:7";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
