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
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(pinoHttp({ logger, genReqId: () => randomUUID() }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests" },
  }),
);
app.use(express.json({ limit: "128kb" }));
app.use(cookieParser());
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", service: "odan-construction-estimates" }),
);
app.use(
  "/api",
  (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  },
  loadSession,
  csrf,
  routes,
);
app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errors);
