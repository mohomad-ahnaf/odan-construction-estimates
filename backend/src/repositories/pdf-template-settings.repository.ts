import { db } from "../db.js";
import { defaultPdfTemplateSettings, type PdfTemplateSettings } from "../services/pdf-template-settings.service.js";

function present(row: NonNullable<Awaited<ReturnType<typeof db.pdfTemplateSettings.findUnique>>>): PdfTemplateSettings {
  return {
    companyName: row.companyName,
    companyAddress: row.companyAddress,
    companyPhone: row.companyPhone,
    companyEmail: row.companyEmail,
    logoDataUrl: row.logoData && row.logoMimeType
      ? `data:${row.logoMimeType};base64,${Buffer.from(row.logoData).toString("base64")}`
      : null,
    documentTitle: row.documentTitle,
    footerNote: row.footerNote,
    termsConditions: row.termsConditions,
    primaryColor: row.primaryColor,
    accentColor: row.accentColor,
    fontFamily: row.fontFamily as PdfTemplateSettings["fontFamily"],
    headerLayout: row.headerLayout as PdfTemplateSettings["headerLayout"],
    watermarkEnabled: row.watermarkEnabled,
    watermarkOpacity: row.watermarkOpacity,
    watermarkSize: row.watermarkSize as PdfTemplateSettings["watermarkSize"],
    tableStyle: row.tableStyle as PdfTemplateSettings["tableStyle"],
  };
}

export const pdfTemplateSettingsRepository = {
  async get(): Promise<PdfTemplateSettings> {
    const row = await db.pdfTemplateSettings.findUnique({ where: { id: 1 } });
    return row ? present(row) : defaultPdfTemplateSettings;
  },
  async save(settings: PdfTemplateSettings, actorId: string): Promise<PdfTemplateSettings> {
    const { logoDataUrl, ...fields } = settings;
    const match = logoDataUrl ? /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(logoDataUrl) : null;
    const data = {
      ...fields,
      logoData: match ? Buffer.from(match[2], "base64") : null,
      logoMimeType: match?.[1] ?? null,
    };
    const row = await db.$transaction(async (tx) => {
      const updated = await tx.pdfTemplateSettings.upsert({
        where: { id: 1 },
        create: { id: 1, ...data },
        update: data,
      });
      await tx.auditLog.create({ data: { actorId, action: "PDF_TEMPLATE_UPDATED" } });
      return updated;
    });
    return present(row);
  },
};
