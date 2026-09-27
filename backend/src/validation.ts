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
export const newPasswordSchema = z.string().min(16).max(128);
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: newPasswordSchema,
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
    clientId: z.string().uuid(),
    projectId: z.string().uuid(),
    estimateDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (value) =>
          !Number.isNaN(Date.parse(value)) &&
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
        "Invalid estimate date",
      ),
    currency: z.enum(["LKR", "USD", "GBP", "EUR"]).default("LKR"),
    taxPercent: z.number().min(0).max(100).multipleOf(0.01),
    notes: z.string().max(4000),
    items: z.array(itemSchema).min(1).max(100),
  })
  .strict();
export type EstimateInput = z.infer<typeof estimateSchema>;
export const projectEstimateSchema = estimateSchema.omit({
  clientId: true,
  projectId: true,
});
export type ProjectEstimateInput = z.infer<typeof projectEstimateSchema>;
export const updateSchema = estimateSchema.extend({
  version: z.number().int().positive(),
});
export const statusSchema = z
  .object({
    status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED"]),
    version: z.number().int().positive(),
  })
  .strict();

const optional = (limit: number) =>
  z
    .string()
    .trim()
    .max(limit)
    .transform((v) => v || null);
const calendarDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};
const code = (limit: number) =>
  optional(limit).transform((v) => v?.toUpperCase() ?? null);
const email = z
  .union([z.string().trim().email().max(254), z.literal("")])
  .transform((v) => (v ? v.toLowerCase() : null));
export const clientSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    registrationNumber: code(80),
    vatNumber: code(80),
    address: optional(500),
    contactPerson: optional(160),
    telephone: optional(40),
    email,
    notes: optional(4000),
  })
  .strict();
export const projectSchema = z
  .object({
    projectCode: code(80),
    projectName: z.string().trim().min(1).max(160),
    siteAddress: optional(500),
    description: optional(4000),
    startDate: z
      .union([
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine(calendarDate),
        z.literal(""),
      ])
      .transform((v) => v || null),
    completionDate: z
      .union([
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine(calendarDate),
        z.literal(""),
      ])
      .transform((v) => v || null),
  })
  .strict()
  .refine(
    (v) => !v.startDate || !v.completionDate || v.completionDate >= v.startDate,
    {
      path: ["completionDate"],
      message: "Completion date precedes start date",
    },
  );
export const listSchema = z
  .object({
    search: z.string().trim().max(160).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(["name", "createdAt"]).default("name"),
    direction: z.enum(["asc", "desc"]).default("asc"),
    active: z.enum(["true", "false"]).optional(),
  })
  .strict();
