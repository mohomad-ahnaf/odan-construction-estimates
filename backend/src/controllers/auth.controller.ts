import type { RequestHandler } from "express";
import {
  createSession,
  authenticate,
  changePassword as updatePassword,
} from "../services/auth.service.js";
import { authRepository } from "../repositories/auth.repository.js";
import { cookieName, cookieOptions } from "../middleware/auth.js";
import { loginSchema, changePasswordSchema } from "../validation.js";
export const session: RequestHandler = async (req, res) => {
  if (!req.session) {
    const created = await createSession();
    res.cookie(cookieName, created.token, {
      ...cookieOptions,
      maxAge: 30 * 60 * 1000,
    });
    res.json({ user: null, csrfToken: created.session.csrfToken });
    return;
  }
  res.json({
    user: req.user
      ? {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
        }
      : null,
    csrfToken: req.session.csrfToken,
  });
};
export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await authenticate(input.email, input.password);
  if (req.session) await authRepository.remove(req.session.id);
  const created = await createSession(user.id);
  res.cookie(cookieName, created.token, {
    ...cookieOptions,
    maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    csrfToken: created.session.csrfToken,
  });
};
export const logout: RequestHandler = async (req, res) => {
  if (req.session) await authRepository.remove(req.session.id);
  await authRepository.audit("AUTH_LOGOUT", req.user?.id);
  res.clearCookie(cookieName, cookieOptions);
  res.status(204).end();
};
export const changePassword: RequestHandler = async (req, res) => {
  const input = changePasswordSchema.parse(req.body);
  await updatePassword(
    req.user!.id,
    req.session!.id,
    input.currentPassword,
    input.newPassword,
  );
  res.status(204).end();
};
