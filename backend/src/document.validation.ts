import { z } from "zod";

export const documentCategorySchema = z.enum([
  "DRAWINGS",
  "IMAGES",
  "CONTRACTS",
  "BOQ",
  "REPORTS",
  "OTHER",
]);

export type DocumentCategoryInput = z.infer<typeof documentCategorySchema>;

export const revisionNoteSchema = z
  .string()
  .trim()
  .max(1000, "Revision note must be 1000 characters or fewer")
  .optional()
  .transform((value) => value || null);

export const documentMetadataSchema = z.object({
  title: z.string().trim().max(160, "Title must be 160 characters or fewer").nullable().optional(),
  description: z.string().trim().max(1000, "Description must be 1000 characters or fewer").nullable().optional(),
}).strict().refine((value) => value.title !== undefined || value.description !== undefined,
  "Provide a title or description");

export const uploadMetadataSchema = z.object({
  title: z.string().trim().max(160).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const approvalCommentSchema = z
  .object({ comment: z.string().trim().max(1000).optional() })
  .strict();

export const rejectionCommentSchema = z
  .object({
    comment: z
      .string()
      .trim()
      .min(1, "A rejection comment is required")
      .max(1000),
  })
  .strict();
