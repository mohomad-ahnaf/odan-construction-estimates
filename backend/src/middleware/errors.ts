import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const errors: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Invalid input", issues: error.flatten() });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ message: "Invalid JSON" });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ message: "Request too large" });
    return;
  }
  logger.error({ err: error, requestId: req.id }, "Request failed");
  res.status(500).json({ message: "An unexpected error occurred" });
};
