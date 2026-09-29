import { Router } from "express";

import * as controller from "../controllers/google-drive.controller.js";

import {
  allow,
  csrf,
  loadSession,
  requireAuth,
} from "../middleware/auth.js";


const router = Router();


router.use((_req, res, next) => {

  res.setHeader(
    "Cache-Control",
    "no-store",
  );

  next();

});


/*
 Google callback
 Public route.
 Google redirects here.
*/
router.get(
  "/callback",
  controller.callback,
);


/*
 Odan ADMIN required routes
*/
router.use(
  loadSession,
  csrf,
  requireAuth,
  allow("ADMIN"),
);


router.get(
  "/connect",
  controller.connect,
);


router.get(
  "/status",
  controller.status,
);


router.delete(
  "/disconnect",
  controller.disconnect,
);


export default router;