import type { RequestHandler } from "express";
import type { Role, Session, User } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { authRepository } from "../repositories/auth.repository.js";
import { digest } from "../services/auth.service.js";
import { AppError } from "./errors.js";
import { config } from "../config.js";
declare global {
  namespace Express {
    interface Request {
      session?: Session;
      user?: User;
    }
  }
}
export const cookieName = "odan_estimates_session";
export function isAllowedCsrfOrigin(origin: string | undefined, localOrigin: string,
  tunnelOrigin?: string) {
  return origin === localOrigin || (!!tunnelOrigin && origin === tunnelOrigin);
}
export const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api",
};
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token = req.cookies[cookieName];
  if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token)) {
    const session = await authRepository.session(digest(token));
    if (session && session.expiresAt > new Date()) {
      req.session = session;
      req.user = session.user ?? undefined;
    }
  }
  next();
};
export const csrf: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const token = req.get("x-csrf-token");
  const expected = req.session?.csrfToken;
  if (
    !isAllowedCsrfOrigin(req.get("origin"), config.ODAN_ORIGIN, config.ODAN_TUNNEL_ORIGIN) ||
    !token ||
    !expected ||
    Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    throw new AppError(403, "Invalid request verification token");
  next();
};
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new AppError(401, "Please sign in");
  next();
};
export const allow =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      throw new AppError(403, "You do not have permission");
    next();
  };
