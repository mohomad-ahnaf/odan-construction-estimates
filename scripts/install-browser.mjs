import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve("@playwright/test/cli"), "install", "chromium"],
  {
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: fileURLToPath(
        new URL("../.cache/playwright", import.meta.url),
      ),
      PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: "30000",
    },
    stdio: "inherit",
    windowsHide: true,
  },
);
process.exit(result.status ?? 1);
