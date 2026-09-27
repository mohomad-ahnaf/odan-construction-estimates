import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const local = dotenv.parse(readFileSync(new URL("../.env", import.meta.url)));
const target = new URL(local.DATABASE_URL);
if (
  target.protocol !== "postgresql:" ||
  target.hostname !== "localhost" ||
  (target.port || "5432") !== "5432" ||
  target.pathname !== "/odan_estimation"
)
  throw new Error("Refusing a database outside this project.");
const result = spawnSync(
  process.execPath,
  [require.resolve("prisma/build/index.js"), ...process.argv.slice(2)],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, DATABASE_URL: local.DATABASE_URL },
    stdio: "inherit",
    windowsHide: true,
  },
);
process.exit(result.status ?? 1);
