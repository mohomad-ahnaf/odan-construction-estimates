import { readFileSync } from "node:fs";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "../src/db.js";
// Read credentials from stdin, never command-line arguments or logs.
const input = z
  .object({
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase()),
    name: z.string().min(1).max(160),
    role: z.enum(["ADMIN", "ESTIMATOR", "VIEWER"]),
    password: z.string().min(16).max(128),
  })
  .strict()
  .parse(JSON.parse(readFileSync(0, "utf8")));
try {
  const { password, ...data } = input;
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  await db.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: { ...data, passwordHash },
    });
    await transaction.auditLog.create({
      data: { action: "USER_PROVISIONED_BY_OPERATOR", entityId: user.id },
    });
  });
  console.log("User created.");
} finally {
  await db.$disconnect();
}
