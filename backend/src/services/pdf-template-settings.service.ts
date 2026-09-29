import { z } from "zod";
import { AppError } from "../middleware/errors.js";
import { pdfTemplateSettingsRepository } from "../repositories/pdf-template-settings.repository.js";

const clean = (value: string) => value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();
const text = (max: number) => z.string().transform(clean).pipe(z.string().min(1).max(max));
const optionalText = (max: number) => z.string().transform(clean).pipe(z.string().max(max));
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/).transform((value) => value.toUpperCase());

export const pdfTemplateSettingsSchema = z.object({
  companyName: text(120),
  companyAddress: text(300),
  companyPhone: text(80),
  companyEmail: z.string().trim().email().max(254),
  logoDataUrl: z.string().max(1_400_000).nullable(),
  documentTitle: text(100),
  footerNote: text(1000),
  termsConditions: optionalText(4000),
  primaryColor: color,
  accentColor: color,
  fontFamily: z.enum(["Helvetica", "Roboto", "Times New Roman", "Inter"]),
  headerLayout: z.enum(["LEFT", "CENTER", "RIGHT"]),
  watermarkEnabled: z.boolean(),
  watermarkOpacity: z.number().min(0.01).max(0.1),
  watermarkSize: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  tableStyle: z.enum(["NAVY", "GOLD", "LIGHT_GRAY"]),
}).strict();

export type PdfTemplateSettings = z.infer<typeof pdfTemplateSettingsSchema>;

export const defaultPdfTemplateSettings: PdfTemplateSettings = {
  companyName: "Odan Construction",
  companyAddress: "19B, Sujatha Avenue, Dehiwala",
  companyPhone: "077 811 9382",
  companyEmail: "odanconstruction@gmail.com",
  logoDataUrl: null,
  documentTitle: "CONSTRUCTION ESTIMATE",
  footerNote: "Note: Amounts shown in LKR. This estimate is based on the quantities and rates listed above and is subject to site conditions and material price variation.",
  termsConditions: "",
  primaryColor: "#06233F",
  accentColor: "#C9A44C",
  fontFamily: "Helvetica",
  headerLayout: "LEFT",
  watermarkEnabled: true,
  watermarkOpacity: 0.045,
  watermarkSize: "MEDIUM",
  tableStyle: "NAVY",
};

export function parsePdfTemplateSettings(input: unknown): PdfTemplateSettings {
  const settings = pdfTemplateSettingsSchema.parse(input);
  if (!settings.logoDataUrl) return settings;
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(settings.logoDataUrl);
  if (!match) throw new AppError(400, "Invalid logo image");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 1_000_000 || bytes.length < 16 || bytes.toString("base64") !== match[2])
    throw new AppError(400, "Invalid logo image");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR";
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if ((match[1] === "image/png" && !png) || (match[1] === "image/jpeg" && !jpeg))
    throw new AppError(400, "Invalid logo image");
  return settings;
}

export const getPdfTemplateSettings = () => pdfTemplateSettingsRepository.get();
export const savePdfTemplateSettings = (input: unknown, actorId: string) =>
  pdfTemplateSettingsRepository.save(parsePdfTemplateSettings(input), actorId);
