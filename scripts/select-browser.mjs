import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
const executablePath = process.argv[2];
if (
  !executablePath ||
  !isAbsolute(executablePath) ||
  !existsSync(executablePath)
) {
  throw new Error(
    "Provide the absolute path to an installed Chrome or Chromium executable.",
  );
}
mkdirSync(new URL("../.cache/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../.cache/browser.json", import.meta.url),
  JSON.stringify({ executablePath }, null, 2) + "\n",
);
console.log(
  "Saved this project’s explicit browser selection in .cache/browser.json.",
);
