import { z } from "zod";
export const loginSchema = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
export const itemSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    unit: z.string().trim().min(1).max(20),
    quantity: z.number().positive().max(1000000).multipleOf(0.001),
    rate: z.number().nonnegative().max(10000000).multipleOf(0.01),
  })
  .strict();
export const estimateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    clientName: z.string().trim().min(1).max(160),
    clientEmail: z
      .union([z.string().email().max(254), z.literal("")])
      .default(""),
    siteAddress: z.string().trim().max(500),
    currency: z.enum(["LKR", "USD", "GBP", "EUR"]).default("LKR"),
    taxPercent: z.number().min(0).max(100).multipleOf(0.01),
    notes: z.string().max(4000),
    items: z.array(itemSchema).min(1).max(100),
  })
  .strict();
export type EstimateInput = z.infer<typeof estimateSchema>;
export const updateSchema = estimateSchema.extend({
  version: z.number().int().positive(),
});
export const statusSchema = z
  .object({
    status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED"]),
    version: z.number().int().positive(),
  })
  .strict();
