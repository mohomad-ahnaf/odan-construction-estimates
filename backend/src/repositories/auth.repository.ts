import { db } from "../db.js";
export const authRepository = {
  user: (email: string) => db.user.findUnique({ where: { email } }),
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
};
