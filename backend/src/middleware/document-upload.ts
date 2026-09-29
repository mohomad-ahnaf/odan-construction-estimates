import type { RequestHandler } from "express";
import multer from "multer";
import { AppError } from "./errors.js";

export const maximumDocumentBytes = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maximumDocumentBytes, files: 1, fields: 4 },
}).single("file");

export const documentUpload: RequestHandler = (req, res, next) => {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE")
      return next(new AppError(413, "File exceeds the 25 MB limit"));
    if (error instanceof multer.MulterError)
      return next(new AppError(400, "Invalid document upload"));
    return next(error);
  });
};
