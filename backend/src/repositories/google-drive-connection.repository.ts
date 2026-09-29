import { db } from "../db.js";

type ConnectionInput = {
  email: string;
  accessToken: string | null;
  refreshToken: string;
  expiresAt: Date | null;
};
const safeSelect = {
  id: true,
  email: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const googleDriveConnectionRepository = {
  findByEmail(email: string) {
    return db.googleDriveConnection.findUnique({ where: { email } });
  },
  latest() {
    return db.googleDriveConnection.findFirst({
      select: safeSelect,
      orderBy: { updatedAt: "desc" },
    });
  },
  latestWithTokens() {
    return db.googleDriveConnection.findFirst({
      orderBy: { updatedAt: "desc" },
    });
  },
  updateTokens(
    id: string,
    input: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: Date | null;
    },
  ) {
    return db.googleDriveConnection.update({
      where: { id },
      data: input,
      select: safeSelect,
    });
  },
  async upsert(input: ConnectionInput, actorId: string) {
    return db.$transaction(async (tx) => {
      const connection = await tx.googleDriveConnection.upsert({
        where: { email: input.email },
        create: input,
        update: {
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          expiresAt: input.expiresAt,
        },
        select: safeSelect,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "GOOGLE_DRIVE_CONNECTED",
          entityId: connection.id,
          metadata: { email: connection.email },
        },
      });
      return connection;
    });
  },
  async disconnect(actorId: string) {
    return db.$transaction(async (tx) => {
      const removed = await tx.googleDriveConnection.deleteMany();
      if (removed.count)
        await tx.auditLog.create({
          data: { actorId, action: "GOOGLE_DRIVE_DISCONNECTED" },
        });
      return removed.count;
    });
  },
};
