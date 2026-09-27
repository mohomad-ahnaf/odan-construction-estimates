import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/db.js";
import {
  applyReconciliation,
  previewReconciliation,
  reconciliationPlanSchema,
  unlinkedEstimateReport,
} from "../src/services/reconciliation.service.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = join(root, ".cache", "reconciliation");
const reportFile = join(directory, "report.json");
const planFile = join(directory, "plan.json");

function verifiedBackup() {
  const folder = join(root, ".cache", "backups");
  if (!existsSync(folder)) throw new Error("No database backup found");
  const files = readdirSync(folder)
    .filter((name) => /^odan_estimation-.*\.dump$/.test(name))
    .map((name) => join(folder, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!files.length) throw new Error("No database backup found");
  const checked = spawnSync(
    "C:/Program Files/PostgreSQL/18/bin/pg_restore.exe",
    ["--list", files[0]],
    { stdio: "ignore", windowsHide: true },
  );
  if (checked.status !== 0)
    throw new Error("Database backup could not be verified");
  return files[0];
}

async function main() {
  const mode = process.argv[2];
  if (
    !["report", "preview", "apply"].includes(mode) ||
    process.argv.length !== 3
  )
    throw new Error("Use report, preview, or apply");
  if (mode === "report") {
    const rows = await unlinkedEstimateReport();
    mkdirSync(directory, { recursive: true });
    writeFileSync(reportFile, JSON.stringify(rows, null, 2));
    if (!existsSync(planFile)) {
      writeFileSync(
        planFile,
        JSON.stringify(
          {
            newClients: [],
            newProjects: [],
            links: rows.map((row) => ({
              estimateId: row.id,
              classification: "REPLACE_WITH_REAL_SAMPLE_OR_E2E_TEST",
              clientRef: "new:REPLACE_CLIENT",
              projectRef: "new:REPLACE_PROJECT",
            })),
          },
          null,
          2,
        ),
      );
    }
    process.stdout.write(
      `Report saved to .cache/reconciliation/report.json (${rows.length} unlinked estimates).\n`,
    );
    process.stdout.write(
      "Edit .cache/reconciliation/plan.json; no links have been changed.\n",
    );
    return;
  }
  const plan = reconciliationPlanSchema.parse(
    JSON.parse(readFileSync(planFile, "utf8")),
  );
  const preview = await previewReconciliation(plan);
  process.stdout.write(
    `${JSON.stringify({ linksToUpdate: preview.length, rows: preview }, null, 2)}\n`,
  );
  if (mode === "preview") return;
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Interactive terminal required for apply");
  const backup = verifiedBackup();
  process.stdout.write(`Validated backup: ${backup}\n`);
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let answer = "";
  try {
    answer = await terminal.question(
      "Type APPLY to create the selected records and links: ",
    );
  } finally {
    terminal.close();
  }
  if (answer !== "APPLY") throw new Error("No changes were made");
  const result = await applyReconciliation(plan);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  await main();
} catch (error) {
  const allowed = [
    "Use report, preview, or apply",
    "No database backup found",
    "Database backup could not be verified",
    "Interactive terminal required for apply",
    "No changes were made",
  ];
  const message =
    error instanceof Error && allowed.includes(error.message)
      ? error.message
      : "Reconciliation plan is invalid or database state changed";
  process.stderr.write(`${message}.\n`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
