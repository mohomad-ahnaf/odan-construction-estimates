import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";

import { logger } from "./logger.js";
import { loadSession, csrf } from "./middleware/auth.js";
import { errors } from "./middleware/errors.js";
import { routes } from "./routes/index.js";
import googleDriveRoutes from "./routes/google-drive.routes.js";

export const app = express();

app.disable("x-powered-by");


/**
 * Security middleware
 */
app.use(helmet());

app.use(
  pinoHttp({
    logger,
    genReqId: () => randomUUID(),
  }),
);


/**
 * API rate limiting
 */
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      message: "Too many requests",
    },
  }),
);


/**
 * Body parsing
 */
app.use(
  "/api/settings/pdf-template",
  express.json({
    limit: "2mb",
  }),
);

app.use(
  express.json({
    limit: "128kb",
  }),
);


app.use(cookieParser());


/**
 * Health check
 */
app.get(
  "/api/health",
  (_req, res) => {
    res.json({
      status: "ok",
      service: "odan-construction-estimates",
    });
  },
);


/**
 * Google OAuth routes
 *
 * IMPORTANT:
 * Must stay BEFORE Odan authentication middleware.
 */
app.use(
  "/api/google-drive",
  googleDriveRoutes,
);


/**
 * Protected Odan API routes
 */
app.use(
  "/api",
  (_req, res, next) => {
    res.setHeader(
      "Cache-Control",
      "no-store",
    );
    next();
  },
  loadSession,
  csrf,
  routes,
);


/**
 * 404 handler
 */
app.use(
  (_req, res) => {
    res.status(404).json({
      message: "Route not found",
    });
  },
);


/**
 * Error handler
 */
app.use(errors);