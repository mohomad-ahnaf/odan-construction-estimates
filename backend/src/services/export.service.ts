import ExcelJS from "exceljs";
import { estimateDescription } from "./estimate-description.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { logger } from "../logger.js";
import { totals } from "./totals.js";
import { withPdfPage } from "./pdf-browser.js";
import { pdfDocumentStyles } from "./pdf-document-style.js";
import { defaultPdfTemplateSettings, getPdfTemplateSettings, type PdfTemplateSettings } from "./pdf-template-settings.service.js";
import type { getEstimate } from "./estimate.service.js";
type Estimate = Awaited<ReturnType<typeof getEstimate>>;
const require = createRequire(import.meta.url);
const fontCache = new Map<string, string>();
function embeddedFontStyles(font: PdfTemplateSettings["fontFamily"]): string {
  if (font !== "Roboto" && font !== "Inter") return "";
  const cached = fontCache.get(font);
  if (cached) return cached;
  const family = font.toLowerCase();
  const styles = [400, 700].map((weight) => {
    const path = require.resolve(`@fontsource/${family}/files/${family}-latin-${weight}-normal.woff2`);
    const data = readFileSync(path).toString("base64");
    return `@font-face{font-family:'${font}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};font-style:normal}`;
  }).join("\n");
  fontCache.set(font, styles);
  return styles;
}
const pdfLogoUrl = new URL(
  "../../assets/branding/odan-logo-transparent.png",
  import.meta.url,
);
const watermarkUrl = new URL(
  "../../assets/branding/odan-logo-transparent.png",
  import.meta.url,
);
let logoWarningIssued = false;
let watermarkWarningIssued = false;
function warnLogo(reason: string) {
  if (logoWarningIssued) return;
  logoWarningIssued = true;
  logger.warn({ reason }, "PDF logo unavailable; continuing without it");
}
function warnWatermark(reason: string) {
  if (watermarkWarningIssued) return;
  watermarkWarningIssued = true;
  logger.warn({ reason }, "PDF watermark unavailable; continuing without it");
}
export function loadPdfWatermark(assetUrl = watermarkUrl): string | null {
  try {
    const image = readFileSync(assetUrl);
    if (!isSupportedPng(image)) {
      warnWatermark("unsupported PNG");
      return null;
    }
    return image.toString("base64");
  } catch {
    warnWatermark("asset unreadable");
    return null;
  }
}
function isSupportedPng(image: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return (
    image.length >= 33 &&
    image.subarray(0, 8).equals(signature) &&
    image.toString("ascii", 12, 16) === "IHDR" &&
    image.readUInt32BE(16) > 0 &&
    image.readUInt32BE(20) > 0 &&
    image.readUInt32BE(16) <= 10000 &&
    image.readUInt32BE(20) <= 10000 &&
    image[24] === 8 &&
    [2, 6].includes(image[25])
  );
}
export function loadPdfLogo(assetUrl = pdfLogoUrl): string | null {
  try {
    const image = readFileSync(assetUrl);
    if (!isSupportedPng(image)) {
      warnLogo("unsupported PNG");
      return null;
    }
    return image.toString("base64");
  } catch {
    warnLogo("asset unreadable");
    return null;
  }
}
export const escapeHtml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const mandatoryPdfNote =
  "Note: Amounts shown in LKR. This estimate is based on the quantities and rates listed above and is subject to site conditions and material price variation.";
const displayAmount = (value: string) => {
  const [whole, fraction = "00"] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
};

export function renderEstimate(
  estimate: Estimate,
  includeLogo = true,
  includeWatermark = true,
  settings: PdfTemplateSettings = defaultPdfTemplateSettings,
) {
  const calculated = totals(
    estimate.items,
    estimate.taxPercent,
    estimate.markupPercent,
  );
  const fallbackLogo = includeLogo && !settings.logoDataUrl ? loadPdfLogo() : null;
  const pdfLogo = includeLogo ? (settings.logoDataUrl ?? (fallbackLogo ? `data:image/png;base64,${fallbackLogo}` : null)) : null;
  const watermark = includeWatermark && settings.watermarkEnabled ? loadPdfWatermark() : null;
  const e = escapeHtml;
  const font = {
    Helvetica: "Arial,Helvetica,sans-serif",
    Roboto: "Roboto,Arial,sans-serif",
    "Times New Roman": "'Times New Roman',Times,serif",
    Inter: "Inter,Arial,sans-serif",
  }[settings.fontFamily];
  const watermarkSize = {
    SMALL: "80mm;height:42mm",
    MEDIUM: "112mm;height:58mm",
    LARGE: "145mm;height:75mm",
  }[settings.watermarkSize];
  const headerLayout = {
    LEFT: "",
    CENTER: "header{flex-direction:column;align-items:center}.company{align-self:center}.document-title{text-align:center}",
    RIGHT: "header{flex-direction:row-reverse}.document-title{text-align:left}",
  }[settings.headerLayout];
  const tableHeader = settings.tableStyle === "GOLD"
    ? `background:${settings.accentColor};color:#071A2F`
    : settings.tableStyle === "LIGHT_GRAY"
      ? "background:#E8ECEE;color:#071A2F"
      : `background:${settings.primaryColor};color:#fff`;
  const templateStyles = `
    ${embeddedFontStyles(settings.fontFamily)}
    body{font-family:${font}}
    h1,.notes h2,.detail-value{color:${settings.primaryColor}}
    .eyebrow,.detail-label{color:${settings.accentColor}}
    header{border-bottom-color:${settings.accentColor}}
    .items th{${tableHeader}}
    .summary .final-total td{border-top-color:${settings.accentColor};color:${settings.primaryColor}}
    .watermark{width:${watermarkSize};opacity:${settings.watermarkOpacity}}
    .terms-conditions{margin:4mm 0 6mm;white-space:pre-wrap;overflow-wrap:anywhere}
    .terms-conditions h2{font-size:15px;color:${settings.primaryColor};margin:0 0 2mm}
    .terms-conditions p{margin:0;line-height:1.45}
    .mandatory-note{white-space:pre-wrap;overflow-wrap:anywhere}
    ${headerLayout}
  `;
  const contact = `${e(settings.companyEmail)}<br>${e(settings.companyPhone)}<br>${e(settings.companyAddress).replace(/\n/g, "<br>")}`;
  const detailRow = (label: string, value: string) =>
    `<div class="detail-row"><span class="detail-label">${e(label)}</span><span class="detail-value">${e(value)}</span></div>`;
  const leftDetails = [
    detailRow("Estimate Number", estimate.number),
    detailRow("Description", estimateDescription(estimate)),
    detailRow("Client Number", estimate.client?.clientCode ?? "Not available"),
  ].join("");
  const rightDetails = [
    detailRow(
      "Estimate Date",
      (estimate.estimateDate ?? estimate.createdAt).toISOString().slice(0, 10),
    ),
    detailRow("Currency", estimate.currency),
    detailRow("Project", estimate.title),
    detailRow("Project Code", estimate.projectCodeSnapshot ?? "Not available"),
  ].join("");
  const itemRows = estimate.items
    .map(
      (item, index) =>
        `<tr><td class="num">${index + 1}</td><td>${e(item.description)}</td><td>${e(item.unit)}</td><td class="num">${e(item.quantity)}</td><td class="num">${displayAmount(item.rate.toFixed(2))}</td><td class="num">${displayAmount(calculated.lines[index])}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${pdfDocumentStyles}
    ${templateStyles}
    .items th:nth-child(1){width:7%}.items th:nth-child(2){width:40%}.items th:nth-child(3){width:9%}.items th:nth-child(4){width:10%}.items th:nth-child(5){width:16%}.items th:nth-child(6){width:18%}
    .summary{width:67%}
  </style></head><body>
    ${watermark ? `<img class="watermark" src="data:image/png;base64,${watermark}" alt="" aria-hidden="true">` : ""}
    <main><header><div class="company">${pdfLogo ? `<img src="${pdfLogo}" alt="${e(settings.companyName)}">` : `<div class="company-name">${e(settings.companyName.toUpperCase())}</div>`}</div><div class="document-title"><span class="eyebrow">ESTIMATE</span><h1>${e(settings.documentTitle)}</h1><div class="company-contact">${contact}</div></div></header>
    <section class="metadata"><div class="detail-column">${leftDetails}</div><div class="detail-column">${rightDetails}</div></section>
    <table class="items"><thead><tr><th class="num">No.</th><th>Description</th><th>Unit</th><th class="num">Quantity</th><th class="num">Unit Rate</th><th class="num">Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
    <table class="summary"><tbody><tr><td>Base Subtotal</td><td></td><td class="num">${displayAmount(calculated.baseSubtotal)}</td></tr><tr><td>Markup</td><td class="num">${e(estimate.markupPercent)}%</td><td class="num">${displayAmount(calculated.markupAmount)}</td></tr><tr><td>Subtotal After Markup</td><td></td><td class="num">${displayAmount(calculated.subtotalAfterMarkup)}</td></tr><tr><td>Tax</td><td class="num">${e(estimate.taxPercent)}%</td><td class="num">${displayAmount(calculated.tax)}</td></tr><tr class="final-total"><td>Final Total (${e(estimate.currency)})</td><td></td><td class="num">${displayAmount(calculated.total)}</td></tr></tbody></table>
    <section class="notes"><h2>Terms / Notes</h2><p>${e(estimate.notes || "No additional terms.")}</p></section>${settings.termsConditions ? `<section class="terms-conditions"><h2>Terms and Conditions</h2><p>${e(settings.termsConditions)}</p></section>` : ""}</main>
    <div class="final-block"><div class="approval"><div>Prepared by / Signature</div><div>Approved by / Signature</div></div><div class="mandatory-note">${e(settings.footerNote)}</div><footer>${e(settings.companyName)} · Estimate Management System</footer></div>
  </body></html>`;
}
export async function pdf(estimate: Estimate, includeWatermark = true, previewSettings?: PdfTemplateSettings) {
  const settings = previewSettings ?? await getPdfTemplateSettings();
  return withPdfPage(async (page) => {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => void request.abort());
    const html = renderEstimate(estimate, true, includeWatermark, settings);
    try {
      const checkImages = async (markup: string) => {
        await page.setContent(markup, { waitUntil: "load", timeout: 15000 });
        return page.evaluate(() => {
          const logo = document.querySelector<HTMLImageElement>(".company img");
          const watermark = document.querySelector<HTMLImageElement>(".watermark");
          return {
            logo: !logo || (logo.complete && logo.naturalWidth > 0),
            watermark: !watermark || (watermark.complete && watermark.naturalWidth > 0),
          };
        });
      };
      let activeSettings = settings;
      let decoded = await checkImages(html);
      if (!decoded.logo && settings.logoDataUrl) {
        warnLogo("custom logo could not be decoded; using built-in logo");
        activeSettings = { ...settings, logoDataUrl: null };
        decoded = await checkImages(renderEstimate(estimate, true, includeWatermark, activeSettings));
      }
      if (!decoded.logo) warnLogo("browser could not decode logo");
      if (!decoded.watermark) {
        warnWatermark("browser could not decode PNG");
      }
      if (!decoded.logo || !decoded.watermark) {
        await page.setContent(
          renderEstimate(
            estimate,
            decoded.logo,
            includeWatermark && decoded.watermark,
            activeSettings,
          ),
          {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          },
        );
      }
    } catch (error) {
      if (!/data:image\/(?:png|jpeg);base64,/.test(html))
        throw error;
      if (html.includes('class="company"') && html.includes('alt="'))
        warnLogo("browser could not load logo");
      if (html.includes('class="watermark"'))
        warnWatermark("browser could not load PNG");
      await page.setContent(renderEstimate(estimate, false, false, settings), {
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
        footerTemplate: `<div style="font-size:9px;width:100%;padding:0 15mm;display:flex;justify-content:space-between;color:#66717D"><span>${escapeHtml(estimate.number)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
        margin: { top: "16mm", bottom: "19mm", left: "15mm", right: "15mm" },
      }),
    );
  });
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
      margins: {
        left: 0.45,
        right: 0.45,
        top: 0.55,
        bottom: 0.6,
        header: 0.22,
        footer: 0.25,
      },
    },
    views: [{ state: "frozen", ySplit: 14, showGridLines: false }],
  });
  sheet.columns = [
    { width: 8 },
    { width: 43 },
    { width: 14 },
    { width: 14 },
    { width: 19 },
    { width: 21 },
  ];
  sheet.properties.defaultRowHeight = 20;
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
  sheet.getCell("C2").value = "Construction Estimate";
  sheet.getCell("C3").value = estimate.number;
  for (const row of [1, 2, 3]) sheet.mergeCells(`C${row}:F${row}`);
  for (const row of [1, 2, 3, 4]) sheet.getRow(row).height = 23;
  sheet.getCell("C1").font = { bold: true, size: 13, color: { argb: navy } };
  sheet.getCell("C2").font = { bold: true, size: 19, color: { argb: navy } };
  sheet.getCell("C3").font = { size: 11, color: { argb: "FF66717D" } };
  for (const column of ["A", "B", "C", "D", "E", "F"])
    sheet.getCell(`${column}4`).border = {
      bottom: { style: "medium", color: { argb: gold } },
    };

  const metadata: [number, string, string, string, string][] = [
    [
      5,
      "Estimate number",
      estimate.number,
      "Estimate date",
      (estimate.estimateDate ?? estimate.createdAt).toISOString().slice(0, 10),
    ],
    [6, "Status", estimate.status, "Currency", estimate.currency],
    [
      8,
      "Client",
      estimate.clientName,
      "Client Number",
      estimate.client?.clientCode ?? "Not available",
    ],
    [
      10,
      "Project",
      estimate.title,
      "Project code",
      estimate.projectCodeSnapshot ?? "Not available",
    ],
  ];
  for (const [row, leftLabel, leftValue, rightLabel, rightValue] of metadata) {
    sheet.getCell(`B${row}`).value = leftLabel;
    sheet.getCell(`C${row}`).value = leftValue;
    sheet.getCell(`E${row}`).value = rightLabel;
    sheet.getCell(`F${row}`).value = rightValue;
    sheet.mergeCells(`C${row}:D${row}`);
    sheet.getCell(`B${row}`).font = { bold: true, color: { argb: navy } };
    sheet.getCell(`E${row}`).font = { bold: true, color: { argb: navy } };
    sheet.getRow(row).height =
      row >= 8
        ? Math.min(120, Math.max(42, Math.ceil(leftValue.length / 28) * 17))
        : 28;
  }
  sheet.getCell("B9").value = "Estimate Description";
  sheet.getCell("C9").value = estimateDescription(estimate);
  sheet.mergeCells("C9:F9");
  sheet.getCell("B9").font = { bold: true, color: { argb: navy } };
  sheet.getRow(9).height = Math.max(
    30,
    Math.ceil(estimateDescription(estimate).length / 68) * 17,
  );
  sheet.getCell("B11").value = "Site address";
  sheet.getCell("C11").value = estimate.siteAddress;
  sheet.mergeCells("C11:F11");
  sheet.getCell("B11").font = { bold: true, color: { argb: navy } };
  sheet.getCell("B12").value = "Client email";
  sheet.getCell("C12").value = estimate.clientEmail ?? "";
  sheet.mergeCells("C12:F12");
  sheet.getCell("B12").font = { bold: true, color: { argb: navy } };
  sheet.getRow(11).height = Math.min(
    110,
    Math.max(28, Math.ceil(estimate.siteAddress.length / 68) * 17),
  );
  sheet.getRow(12).height = 25;

  const headerRow = 14;
  const firstItemRow = headerRow + 1;
  sheet.getRow(headerRow).values = [
    "No.",
    "Description",
    "Unit",
    "Quantity",
    "Unit Rate",
    "Amount",
  ];
  sheet.getRow(headerRow).height = 27;
  sheet.getRow(headerRow).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    cell.border = { bottom: { style: "medium", color: { argb: gold } } };
  });
  const calculated = totals(
    estimate.items,
    estimate.taxPercent,
    estimate.markupPercent,
  );
  estimate.items.forEach((item, index) => {
    const row = firstItemRow + index;
    sheet.getRow(row).values = [
      index + 1,
      item.description,
      item.unit,
      Number(item.quantity),
      Number(item.rate),
      {
        formula: `ROUND(D${row}*E${row},2)`,
        result: Number(calculated.lines[index]),
      },
    ];
    sheet.getRow(row).height = Math.min(
      240,
      Math.max(24, Math.ceil(item.description.length / 42) * 16),
    );
    sheet.getRow(row).eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDD8CC" } } };
    });
  });
  const lastItemRow = firstItemRow + estimate.items.length - 1;
  const baseRow = lastItemRow + 2;
  const markupRow = baseRow + 1;
  const afterMarkupRow = baseRow + 2;
  const taxRow = baseRow + 3;
  const finalRow = baseRow + 4;
  const summary: [number, string, number | "", ExcelJS.CellValue][] = [
    [
      baseRow,
      "Base Subtotal",
      "",
      {
        formula: `SUM(F${firstItemRow}:F${lastItemRow})`,
        result: Number(calculated.baseSubtotal),
      },
    ],
    [
      markupRow,
      "Markup",
      Number(estimate.markupPercent) / 100,
      {
        formula: `ROUND(F${baseRow}*D${markupRow},2)`,
        result: Number(calculated.markupAmount),
      },
    ],
    [
      afterMarkupRow,
      "Subtotal After Markup",
      "",
      {
        formula: `F${baseRow}+F${markupRow}`,
        result: Number(calculated.subtotalAfterMarkup),
      },
    ],
    [
      taxRow,
      "Tax",
      Number(estimate.taxPercent) / 100,
      {
        formula: `ROUND(F${afterMarkupRow}*D${taxRow},2)`,
        result: Number(calculated.tax),
      },
    ],
    [
      finalRow,
      `Final Total (${estimate.currency})`,
      "",
      {
        formula: `F${afterMarkupRow}+F${taxRow}`,
        result: Number(calculated.total),
      },
    ],
  ];
  for (const [row, label, percent, amount] of summary) {
    sheet.getCell(`B${row}`).value = label;
    sheet.mergeCells(`B${row}:C${row}`);
    sheet.getCell(`D${row}`).value = percent;
    sheet.getCell(`F${row}`).value = amount;
    sheet.getRow(row).height = 27;
  }
  sheet.getRow(finalRow).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: navy } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ivory } };
    cell.border = { top: { style: "medium", color: { argb: gold } } };
  });

  const notesHeading = finalRow + 2;
  sheet.getCell(`A${notesHeading}`).value = "Terms / Notes";
  sheet.getCell(`A${notesHeading}`).font = {
    bold: true,
    color: { argb: navy },
  };
  const noteText = estimate.notes || "No additional terms.";
  const noteChunks = noteText.match(/[\s\S]{1,220}/g) ?? [""];
  noteChunks.forEach((chunk, index) => {
    const row = notesHeading + 1 + index;
    sheet.getCell(`B${row}`).value = chunk;
    sheet.mergeCells(`B${row}:F${row}`);
    sheet.getRow(row).height = Math.min(
      110,
      Math.max(30, Math.ceil(chunk.length / 70) * 18),
    );
  });
  const approvalRow = notesHeading + noteChunks.length + 2;
  sheet.getCell(`B${approvalRow}`).value = "Prepared by / Signature";
  sheet.getCell(`D${approvalRow}`).value = "Approved by / Signature";
  sheet.mergeCells(`B${approvalRow}:C${approvalRow}`);
  sheet.mergeCells(`D${approvalRow}:F${approvalRow}`);
  sheet.getRow(approvalRow).height = 38;
  for (const column of ["B", "D"])
    sheet.getCell(`${column}${approvalRow}`).border = {
      top: { style: "thin", color: { argb: navy } },
    };
  const mandatoryNoteRow = approvalRow + 2;
  sheet.getCell(`B${mandatoryNoteRow}`).value = mandatoryPdfNote;
  sheet.mergeCells(`B${mandatoryNoteRow}:F${mandatoryNoteRow}`);
  sheet.getRow(mandatoryNoteRow).height = 58;
  sheet.getCell(`B${mandatoryNoteRow}`).font = {
    size: 9,
    color: { argb: "FF66717D" },
  };
  sheet.getCell(`B${mandatoryNoteRow}`).border = {
    top: { style: "thin", color: { argb: "FFDDD8CC" } },
  };

  sheet.getColumn(4).numFmt = "#,##0.###";
  sheet.getColumn(5).numFmt = "#,##0.00";
  sheet.getColumn(6).numFmt = "#,##0.00";
  sheet.getCell(`D${markupRow}`).numFmt = "0.00%";
  sheet.getCell(`D${taxRow}`).numFmt = "0.00%";
  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  sheet.pageSetup.printArea = `A1:F${mandatoryNoteRow}`;
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  sheet.headerFooter.oddHeader = "&LOdan Construction&RConstruction Estimate";
  sheet.headerFooter.oddFooter = `&LOdan Construction&CEstimate ${estimate.number}&RPage &P of &N`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
