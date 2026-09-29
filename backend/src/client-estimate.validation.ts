import { z } from "zod";

const selectedEstimate = z
  .object({
    sourceEstimateId: z.string().uuid(),
    refreshSnapshot: z.boolean().optional(),
  })
  .strict();

const baseSchema = z
  .object({
    clientEstimateDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
      .refine(
        (value) =>
          !Number.isNaN(Date.parse(value)) &&
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
        "Enter a valid date",
      ),
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(4000).default(""),
    items: z.array(selectedEstimate).min(1).max(100),
  })
  .strict();

const uniqueSelection = (
  value: z.infer<typeof baseSchema>,
  context: z.RefinementCtx,
) => {
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    if (seen.has(item.sourceEstimateId))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items", index, "sourceEstimateId"],
        message: "An estimate may only be selected once",
      });
    seen.add(item.sourceEstimateId);
  });
};

export const clientEstimateSchema = baseSchema.superRefine(uniqueSelection);

export const clientEstimateUpdateSchema = baseSchema
  .extend({ version: z.number().int().positive() })
  .superRefine(uniqueSelection);
export const clientEstimateStatusSchema = z
  .object({
    status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED"]),
    version: z.number().int().positive(),
  })
  .strict();

export type ClientEstimateInput = z.infer<typeof clientEstimateSchema>;
