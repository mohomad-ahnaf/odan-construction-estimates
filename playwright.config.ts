import { defineConfig } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const browser = require("./.puppeteerrc.cjs");
if (!browser.executablePath)
  throw new Error("Run npm run browser:install first.");
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:43187",
    headless: true,
    launchOptions: { executablePath: browser.executablePath },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node backend/dist/server.js",
      url: "http://127.0.0.1:43188/api/health",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js frontend --host 127.0.0.1 --port 43187 --strictPort",
      url: "http://127.0.0.1:43187",
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
