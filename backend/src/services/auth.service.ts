import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";
import { authRepository as repo } from "../repositories/auth.repository.js";
import { AppError } from "../middleware/errors.js";
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const dummyHash = argon2.hash(randomBytes(32), {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
});
export const hashPassword = (password: string) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
export async function createSession(userId?: string) {
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(32).toString("hex");
  const session = await repo.create({
    id: digest(token),
    csrfToken,
    userId,
    expiresAt: new Date(Date.now() + (userId ? 8 * 60 * 60 : 30 * 60) * 1000),
  });
  return { token, session };
}
export async function authenticate(email: string, password: string) {
  const user = await repo.user(email);
  const valid = await argon2.verify(
    user?.passwordHash ?? (await dummyHash),
    password,
  );
  if (!user || !valid) {
    await repo.audit("AUTH_LOGIN_FAILED");
    throw new AppError(401, "Invalid email or password");
  }
  await repo.audit("AUTH_LOGIN", user.id);
  return user;
}
export async function changePassword(
  userId: string,
  sessionId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await repo.userById(userId);
  if (!user || !(await argon2.verify(user.passwordHash, currentPassword)))
    throw new AppError(401, "Invalid credentials");
  if (currentPassword === newPassword)
    throw new AppError(400, "Choose a different password");
  const changed = await repo.replacePassword({
    userId,
    expectedHash: user.passwordHash,
    newHash: await hashPassword(newPassword),
    keepSessionId: sessionId,
    action: "AUTH_PASSWORD_CHANGED",
  });
  if (!changed) throw new AppError(401, "Invalid credentials");
}
