import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";
// Read this application's configuration only; never search parent directories.
const local =
  dotenv.config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    quiet: true,
  }).parsed ?? {};
export const config = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "postgresql:" &&
          url.hostname === "localhost" &&
          (url.port || "5432") === "5432" &&
          url.pathname === "/odan_estimation"
        );
      }, "Use PostgreSQL at localhost:5432 with the dedicated odan_estimation database"),
    ODAN_PORT: z.coerce.number().int().min(1024).max(65535).default(43188),
    ODAN_ORIGIN: z.string().url().default("http://127.0.0.1:43187"),
    ODAN_PDF_LAUNCH_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5000)
      .max(90000)
      .default(30000),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_REDIRECT_URI: z.string().url(),
  })
  .parse(local);
