import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import * as settingsService from "../services/pdf-template-settings.service.js";
import { pdf } from "../services/export.service.js";

export const get: RequestHandler = async (_req, res) => {
  res.json(await settingsService.getPdfTemplateSettings());
};

export const update: RequestHandler = async (req, res) => {
  res.json(await settingsService.savePdfTemplateSettings(req.body, req.user!.id));
};

export const preview: RequestHandler = async (req, res) => {
  const { length } = z.object({ length: z.enum(["short", "long"]).default("short") }).strict().parse(req.query);
  const settings = settingsService.parsePdfTemplateSettings(req.body);
  const count = length === "long" ? 45 : 2;
  const sample = {
    id: "preview",
    number: "ODN-EST-PREVIEW",
    title: "Sample Construction Project",
    description: "Sample scope of construction work",
    clientName: "Sample Client",
    client: { clientCode: "ODN-CLI-0001" },
    projectCodeSnapshot: "ODN-PRJ-0001",
    estimateDate: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    currency: "LKR",
    markupPercent: new Prisma.Decimal(10),
    taxPercent: new Prisma.Decimal(5),
    notes: "Sample estimate notes for template review.",
    items: Array.from({ length: count }, (_, index) => ({
      description: `Sample construction item ${index + 1}`,
      unit: "m²",
      quantity: new Prisma.Decimal(2),
      rate: new Prisma.Decimal(1250),
    })),
  } as never;
  const buffer = await pdf(sample, true, settings);
  res.setHeader("Content-Disposition", 'inline; filename="estimate-template-preview.pdf"');
  res.type("application/pdf").send(buffer);
};
