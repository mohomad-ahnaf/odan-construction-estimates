import ExcelJS from "exceljs";
import { AppError } from "../middleware/errors.js";
import {
  escapeHtml,
  loadPdfLogo,
  loadPdfWatermark,
  mandatoryPdfNote,
} from "./export.service.js";
import { withPdfPage } from "./pdf-browser.js";
import { pdfDocumentStyles } from "./pdf-document-style.js";
import type { getClientEstimate } from "./client-estimate.service.js";

type ClientEstimate = Awaited<ReturnType<typeof getClientEstimate>>;

const displayAmount = (value: string) => {
  const [whole, fraction = "00"] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
};

export function renderClientEstimate(
  record: ClientEstimate,
  includeLogo = true,
  includeWatermark = true,
) {
  const e = escapeHtml;
  const logo = includeLogo ? loadPdfLogo() : null;
  const watermark = includeWatermark ? loadPdfWatermark() : null;
  const detailRow = (label: string, value: string) =>
    `<div class="detail-row"><span class="detail-label">${e(label)}</span><span class="detail-value">${e(value)}</span></div>`;
  const leftDetails = [
    detailRow("Estimate Number", record.clientEstimateNumber),
    detailRow("Description", record.title),
    detailRow("Client Number", record.clientNumberSnapshot ?? "Not available"),
  ].join("");
  const rightDetails = [
    detailRow("Estimate Date", record.clientEstimateDate.toISOString().slice(0, 10)),
    detailRow("Currency", record.currency),
    detailRow("Project", record.projectNameSnapshot),
    detailRow("Project Code", record.projectCodeSnapshot ?? "Not available"),
  ].join("");
  const rows = record.items
    .map(
      (item, index) =>
        `<tr><td class="num">${index + 1}</td><td>${e(item.estimateNumberSnapshot)}</td><td>${e(item.descriptionSnapshot)}</td><td class="num">1</td><td class="num">${displayAmount(item.rateSnapshot.toFixed(2))}</td><td class="num">${displayAmount(item.amountSnapshot.toFixed(2))}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${pdfDocumentStyles}
    .items th:nth-child(1){width:7%}.items th:nth-child(2){width:18%}.items th:nth-child(3){width:31%}.items th:nth-child(4){width:10%}.items th:nth-child(5){width:16%}.items th:nth-child(6){width:18%}
    .grand-total{width:55%}
  </style></head><body>
    ${watermark ? `<img class="watermark" src="data:image/png;base64,${watermark}" alt="" aria-hidden="true">` : ""}
    <main>
    <header><div class="company">${logo ? `<img src="data:image/png;base64,${logo}" alt="Odan Construction">` : `<div class="company-name">ODAN CONSTRUCTION</div>`}</div><div class="document-title"><span class="eyebrow">CLIENT ESTIMATE</span><h1>Client Estimate</h1><div class="company-contact">odanconstruction@gmail.com<br>077 811 9382<br>19B, Sujatha Avenue, Dehiwala</div></div></header>
    <section class="metadata"><div class="detail-column">${leftDetails}</div><div class="detail-column">${rightDetails}</div></section>
    <table class="items"><thead><tr><th class="num">Item</th><th>Estimate</th><th>Description</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="grand-total"><tbody><tr><td>Grand Total (${e(record.currency)})</td><td class="num">${displayAmount(record.grandTotalSnapshot.toFixed(2))}</td></tr></tbody></table>
    <section class="notes"><h2>Terms / Notes</h2><p>${e(record.notes || "No additional terms.")}</p></section></main>
    <div class="final-block"><div class="approval"><div>Prepared by / Signature</div><div>Approved by / Signature</div></div><div class="mandatory-note">${e(mandatoryPdfNote)}</div><footer>Odan Construction · Client Estimate</footer></div>
  </body></html>`;
}

export async function clientEstimatePdf(record: ClientEstimate) {
  return withPdfPage(async (page) => {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => void request.abort());
    const html = renderClientEstimate(record);
    try {
      await page.setContent(html, { waitUntil: "load", timeout: 15000 });
      const decoded = await page.evaluate(() => {
        const logo = document.querySelector<HTMLImageElement>(".company img");
        const watermark = document.querySelector<HTMLImageElement>(".watermark");
        return {
          logo: !logo || (logo.complete && logo.naturalWidth > 0),
          watermark: !watermark || (watermark.complete && watermark.naturalWidth > 0),
        };
      });
      if (!decoded.logo || !decoded.watermark)
        await page.setContent(renderClientEstimate(record, decoded.logo, decoded.watermark), {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
    } catch (error) {
      if (!html.includes("data:image/png;base64,")) throw error;
      await page.setContent(renderClientEstimate(record, false, false), {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
    }
    return Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="font-size:9px;width:100%;padding:0 15mm;display:flex;justify-content:space-between;color:#66717D"><span>${escapeHtml(record.clientEstimateNumber)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
        margin: { top: "16mm", bottom: "19mm", left: "15mm", right: "15mm" },
      }),
    );
  });
}

export async function clientEstimateExcel(record: ClientEstimate) {
  if (!record.items.length)
    throw new AppError(409, "Client Estimate has no rows");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Odan Construction";
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet("Client Estimate", {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.45,
        right: 0.45,
        top: 0.55,
        bottom: 0.6,
        header: 0.22,
        footer: 0.25,
      },
    },
    views: [{ state: "frozen", ySplit: 12, showGridLines: false }],
  });
  sheet.columns = [
    { width: 8 },
    { width: 22 },
    { width: 43 },
    { width: 12 },
    { width: 18 },
    { width: 20 },
  ];
  const navy = "FF0B2745";
  const gold = "FFD5A94E";
  const ivory = "FFF7F5EF";
  const logo = loadPdfLogo();
  if (logo) {
    const imageId = workbook.addImage({
      base64: `data:image/png;base64,${logo}`,
      extension: "png",
    });
    sheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 210, height: 102 },
    });
  }
  sheet.getCell("C1").value = "ODAN CONSTRUCTION";
  sheet.getCell("C2").value = "Client Estimate";
  sheet.getCell("C3").value = record.clientEstimateNumber;
  for (const row of [1, 2, 3]) sheet.mergeCells(`C${row}:F${row}`);
  for (const row of [1, 2, 3, 4]) sheet.getRow(row).height = 23;
  sheet.getCell("C1").font = { bold: true, size: 13, color: { argb: navy } };
  sheet.getCell("C2").font = { bold: true, size: 19, color: { argb: navy } };
  for (const column of ["A", "B", "C", "D", "E", "F"])
    sheet.getCell(`${column}4`).border = {
      bottom: { style: "medium", color: { argb: gold } },
    };
  const metadata: [number, string, string, string, string][] = [
    [
      5,
      "Client Estimate number",
      record.clientEstimateNumber,
      "Date",
      record.clientEstimateDate.toISOString().slice(0, 10),
    ],
    [6, "Status", record.status, "Currency", record.currency],
    [
      8,
      "Client",
      record.clientNameSnapshot,
      "Client Number",
      record.clientNumberSnapshot ?? "Not available",
    ],
    [
      9,
      "Project",
      record.projectNameSnapshot,
      "Project code",
      record.projectCodeSnapshot ?? "Not available",
    ],
    [10, "Title / Description", record.title, "", ""],
  ];
  for (const [row, leftLabel, leftValue, rightLabel, rightValue] of metadata) {
    sheet.getCell(`A${row}`).value = leftLabel;
    sheet.mergeCells(`A${row}:B${row}`);
    sheet.getCell(`C${row}`).value = leftValue;
    sheet.getCell(`E${row}`).value = rightLabel;
    sheet.getCell(`F${row}`).value = rightValue;
    sheet.mergeCells(`C${row}:D${row}`);
    sheet.getCell(`A${row}`).font = { bold: true, color: { argb: navy } };
    sheet.getCell(`E${row}`).font = { bold: true, color: { argb: navy } };
    sheet.getRow(row).height =
      row >= 8
        ? Math.min(100, Math.max(30, Math.ceil(leftValue.length / 65) * 17))
        : 27;
  }
  const headerRow = 12;
  sheet.getRow(headerRow).values = [
    "Item",
    "Estimate",
    "Description",
    "Quantity",
    "Rate",
    "Amount",
  ];
  sheet.getRow(headerRow).height = 27;
  sheet.getRow(headerRow).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    cell.border = { bottom: { style: "medium", color: { argb: gold } } };
  });
  const firstItemRow = headerRow + 1;
  record.items.forEach((item, index) => {
    const row = firstItemRow + index;
    sheet.getRow(row).values = [
      index + 1,
      item.estimateNumberSnapshot,
      item.descriptionSnapshot,
      1,
      Number(item.rateSnapshot),
      {
        formula: `ROUND(D${row}*E${row},2)`,
        result: Number(item.amountSnapshot),
      },
    ];
    sheet.getRow(row).height = Math.min(
      240,
      Math.max(25, Math.ceil(item.descriptionSnapshot.length / 43) * 16),
    );
    sheet.getRow(row).eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDD8CC" } } };
    });
  });
  const lastItemRow = firstItemRow + record.items.length - 1;
  const totalRow = lastItemRow + 2;
  sheet.getCell(`B${totalRow}`).value = `Grand Total (${record.currency})`;
  sheet.mergeCells(`B${totalRow}:D${totalRow}`);
  sheet.getCell(`F${totalRow}`).value = {
    formula: `SUM(F${firstItemRow}:F${lastItemRow})`,
    result: Number(record.grandTotalSnapshot),
  };
  sheet.getRow(totalRow).height = 29;
  sheet.getRow(totalRow).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: navy } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ivory } };
    cell.border = { top: { style: "medium", color: { argb: gold } } };
  });
  const notesRow = totalRow + 2;
  sheet.getCell(`A${notesRow}`).value = "Terms / Notes";
  sheet.getCell(`A${notesRow}`).font = { bold: true, color: { argb: navy } };
  const noteChunks = (record.notes || "No additional terms.").match(
    /[\s\S]{1,220}/g,
  ) ?? [""];
  noteChunks.forEach((chunk, index) => {
    const row = notesRow + 1 + index;
    sheet.getCell(`B${row}`).value = chunk;
    sheet.mergeCells(`B${row}:F${row}`);
    sheet.getRow(row).height = Math.min(
      110,
      Math.max(30, Math.ceil(chunk.length / 85) * 18),
    );
  });
  const approvalRow = notesRow + noteChunks.length + 2;
  sheet.getCell(`B${approvalRow}`).value = "Prepared by / Signature";
  sheet.getCell(`D${approvalRow}`).value = "Approved by / Signature";
  sheet.mergeCells(`B${approvalRow}:C${approvalRow}`);
  sheet.mergeCells(`D${approvalRow}:F${approvalRow}`);
  sheet.getRow(approvalRow).height = 38;
  for (const column of ["B", "D"])
    sheet.getCell(`${column}${approvalRow}`).border = {
      top: { style: "thin", color: { argb: navy } },
    };
  const mandatoryRow = approvalRow + 2;
  sheet.getCell(`B${mandatoryRow}`).value = mandatoryPdfNote;
  sheet.mergeCells(`B${mandatoryRow}:F${mandatoryRow}`);
  sheet.getRow(mandatoryRow).height = 58;
  sheet.getCell(`B${mandatoryRow}`).font = {
    size: 9,
    color: { argb: "FF66717D" },
  };
  sheet.getCell(`B${mandatoryRow}`).border = {
    top: { style: "thin", color: { argb: "FFDDD8CC" } },
  };
  const currencyFormat = ["LKR", "USD", "GBP", "EUR"].includes(record.currency)
    ? `"${record.currency}" #,##0.00`
    : "#,##0.00";
  sheet.getColumn(4).numFmt = "#,##0";
  sheet.getColumn(5).numFmt = currencyFormat;
  sheet.getColumn(6).numFmt = currencyFormat;
  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  sheet.pageSetup.printArea = `A1:F${mandatoryRow}`;
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  sheet.headerFooter.oddHeader = "&LOdan Construction&RClient Estimate";
  sheet.headerFooter.oddFooter = `&LOdan Construction&C${record.clientEstimateNumber}&RPage &P of &N`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
