import { db } from "../db.js";
export const authRepository = {
  user: (email: string) => db.user.findUnique({ where: { email } }),
  userById: (id: string) => db.user.findUnique({ where: { id } }),
  session: (id: string) =>
    db.session.findUnique({ where: { id }, include: { user: true } }),
  create: (data: {
    id: string;
    csrfToken: string;
    expiresAt: Date;
    userId?: string;
  }) => db.session.create({ data }),
  remove: (id: string) => db.session.deleteMany({ where: { id } }),
  cleanup: () =>
    db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  audit: (action: string, actorId?: string) =>
    db.auditLog.create({ data: { action, actorId } }),
  replacePassword: (data: {
    userId: string;
    expectedHash: string;
    newHash: string;
    keepSessionId?: string;
    action: string;
  }) =>
    db.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: data.userId, passwordHash: data.expectedHash },
        data: { passwordHash: data.newHash },
      });
      if (updated.count !== 1) return false;
      await tx.session.deleteMany({
        where: {
          userId: data.userId,
          ...(data.keepSessionId ? { id: { not: data.keepSessionId } } : {}),
        },
      });
      await tx.auditLog.create({
        data: { action: data.action, actorId: data.userId },
      });
      return true;
    }),
};
