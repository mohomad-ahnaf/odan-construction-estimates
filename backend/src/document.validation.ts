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
