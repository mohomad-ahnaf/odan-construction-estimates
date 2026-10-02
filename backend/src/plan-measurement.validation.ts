import { z } from "zod";

export const planPointSchema = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict();

export const planDimensionsSchema = z.object({
  pageNumber: z.number().int().positive().max(10000),
  pageWidth: z.number().finite().positive().max(1_000_000),
  pageHeight: z.number().finite().positive().max(1_000_000),
});

export const referenceLengthSchema = z
  .object({
    unit: z.enum(["mm", "cm", "m", "ft", "in"]),
    value: z.number().finite().positive().optional(),
    feet: z.number().finite().nonnegative().optional(),
    inches: z.number().finite().nonnegative().max(11.999999).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.unit === "ft") {
      if (value.feet === undefined || value.inches === undefined)
        context.addIssue({ code: "custom", message: "Feet and inches are required" });
      else if (value.feet + value.inches / 12 <= 0)
        context.addIssue({ code: "custom", message: "Reference length must be positive" });
    } else if (value.value === undefined) {
      context.addIssue({ code: "custom", message: "Reference length is required" });
    }
  });

const referenceSchema = z
  .object({
    points: z.tuple([planPointSchema, planPointSchema]),
    length: referenceLengthSchema,
  })
  .strict();

export const calibrationSchema = planDimensionsSchema
  .extend({
    reference: referenceSchema,
    checkReference: referenceSchema.optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();

export const measurementGeometrySchema = z
  .object({ points: z.array(planPointSchema).min(1).max(1000) })
  .strict();

export const createMeasurementSchema = planDimensionsSchema
  .extend({
    groupId: z.string().uuid(),
    type: z.enum(["LENGTH", "AREA", "COUNT"]),
    label: z.string().trim().min(1).max(160),
    geometry: measurementGeometrySchema,
  })
  .strict();

export const updateMeasurementSchema = z
  .object({
    version: z.number().int().positive(),
    groupId: z.string().uuid().optional(),
    label: z.string().trim().min(1).max(160).optional(),
    geometry: measurementGeometrySchema.optional(),
    confirmed: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.label !== undefined ||
      value.groupId !== undefined ||
      value.geometry !== undefined ||
      value.confirmed !== undefined,
    "No changes supplied",
  );

export const deleteMeasurementSchema = z
  .object({ version: z.number().int().positive() })
  .strict();

const measurementGroupName = z.string().trim().min(1).max(100);

export const createMeasurementGroupSchema = z.object({ name: measurementGroupName }).strict();
export const updateMeasurementGroupSchema = z.object({
  name: measurementGroupName,
  version: z.number().int().positive(),
}).strict();
export const deleteMeasurementGroupSchema = z.object({
  version: z.number().int().positive(),
  destinationGroupId: z.string().uuid().optional(),
  newGroupName: measurementGroupName.optional(),
}).strict().refine((value) => !(value.destinationGroupId && value.newGroupName), "Choose one destination group");

export type CalibrationInput = z.infer<typeof calibrationSchema>;
export type ReferenceLengthInput = z.infer<typeof referenceLengthSchema>;
export type CreateMeasurementInput = z.infer<typeof createMeasurementSchema>;
export type UpdateMeasurementInput = z.infer<typeof updateMeasurementSchema>;
export type CreateMeasurementGroupInput = z.infer<typeof createMeasurementGroupSchema>;
export type UpdateMeasurementGroupInput = z.infer<typeof updateMeasurementGroupSchema>;
export type DeleteMeasurementGroupInput = z.infer<typeof deleteMeasurementGroupSchema>;
