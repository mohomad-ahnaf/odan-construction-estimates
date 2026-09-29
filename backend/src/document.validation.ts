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
