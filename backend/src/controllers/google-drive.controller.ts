import type { RequestHandler } from "express";
import { z } from "zod";

import { AppError } from "../middleware/errors.js";

import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  getGoogleAuthUrl,
  googleDriveStatus,
} from "../services/google-drive.service.js";


/**
 * Start Google OAuth connection
 *
 * This route must be public.
 * User is authenticated by Google, not by Odan session.
 */
export const connect: RequestHandler = (req, res) => {
  res.redirect(
    getGoogleAuthUrl(req.user!.id),
  );
};


/**
 * Google OAuth callback
 *
 * Google redirects here after permission approval.
 */
export const callback: RequestHandler = async (req, res) => {

  const query = z
    .object({
      code: z.string().min(1).optional(),
      state: z.string().min(1).optional(),
      error: z.string().max(200).optional(),
    })
    .passthrough()
    .parse(req.query);


  if (query.error || !query.code) {
    throw new AppError(
      400,
      "Google authorization was not completed",
    );
  }


  const connection = await connectGoogleDrive(
    query.code,
    query.state ?? "",
  );


  res
    .status(200)
    .type("text/plain")
    .send(
      `Google Drive connected successfully for ${connection.email}. You may close this window.`,
    );
};



/**
 * Check Google Drive connection status
 *
 * Protected by ADMIN middleware.
 */
export const status: RequestHandler = async (_req, res) => {

  res.json(
    await googleDriveStatus(),
  );

};



/**
 * Disconnect Google Drive
 *
 * Protected by ADMIN middleware.
 */
export const disconnect: RequestHandler = async (req, res) => {

  await disconnectGoogleDrive(
    req.user!.id,
  );


  res
    .status(204)
    .send();

};