import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "../src/db.js";
const env =
  dotenv.config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    quiet: true,
  }).parsed ?? {};
const seed = z
  .object({
    ODAN_SEED_EMAIL: z.string().email(),
    ODAN_SEED_PASSWORD: z
      .string()
      .min(16)
      .max(128)
      .refine((v) => !v.includes("REPLACE_"), "Set a unique password"),
  })
  .parse(env);
try {
  const passwordHash = await argon2.hash(seed.ODAN_SEED_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  await db.user.upsert({
    where: { email: seed.ODAN_SEED_EMAIL.toLowerCase() },
    update: {},
    create: {
      email: seed.ODAN_SEED_EMAIL.toLowerCase(),
      name: "Odan Administrator",
      role: "ADMIN",
      passwordHash,
    },
  });
  await db.estimate.upsert({
    where: { number: "OD-DEMO-001" },
    update: {},
    create: {
      number: "OD-DEMO-001",
      title: "Two-storey residence · Preliminary works",
      clientName: "Sample client",
      clientEmail: "client@example.com",
      siteAddress: "Colombo, Sri Lanka",
      currency: "LKR",
      taxPercent: 18,
      notes:
        "Sample estimate for demonstration. Rates must be verified before use.\nValidity: 30 days. Work begins after written acceptance.",
      items: {
        create: [
          {
            position: 0,
            description: "Site clearance and preparation",
            unit: "m²",
            quantity: 180,
            rate: 450,
          },
          {
            position: 1,
            description: "Foundation excavation",
            unit: "m³",
            quantity: 42,
            rate: 3200,
          },
          {
            position: 2,
            description: "Reinforced concrete foundations",
            unit: "m³",
            quantity: 18,
            rate: 38500,
          },
        ],
      },
    },
  });
  console.log(
    "Dedicated Odan database seeded. Existing passwords were not changed.",
  );
} finally {
  await db.$disconnect();
}
