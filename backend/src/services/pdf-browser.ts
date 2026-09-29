import puppeteer, { type Browser, type Page } from "puppeteer";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { AppError } from "../middleware/errors.js";

const require = createRequire(import.meta.url);
const unavailable = () =>
  new AppError(503, "PDF export is temporarily unavailable");
const idleMilliseconds = 15_000;
let browserPromise: Promise<Browser> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let activeExports = 0;

export function resolvePdfExecutable(): string | null {
  let projectBrowser: unknown;
  try {
    projectBrowser = require("../../../.puppeteerrc.cjs").executablePath;
  } catch {
    // A system installation or Puppeteer's managed installation may still work.
  }
  let managedBrowser: unknown;
  try {
    managedBrowser = puppeteer.executablePath();
  } catch {
    // The project may use a separately selected browser.
  }
  const roots =
    process.platform === "win32"
      ? [
          process.env.PROGRAMFILES,
          process.env["PROGRAMFILES(X86)"],
          process.env.LOCALAPPDATA,
        ].filter((path): path is string => Boolean(path))
      : [];
  const candidates: unknown[] = [projectBrowser, managedBrowser];
  for (const root of roots) {
    candidates.push(
      join(root, "Google", "Chrome", "Application", "chrome.exe"),
    );
    candidates.push(
      join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  }
  return (
    candidates.find(
      (path): path is string =>
        typeof path === "string" && isAbsolute(path) && existsSync(path),
    ) ?? null
  );
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = resolvePdfExecutable();
  if (!executablePath) {
    logger.error(
      "No installed Chrome or Chromium executable is available for PDF export",
    );
    throw unavailable();
  }
  try {
    return await puppeteer.launch({
      headless: true,
      executablePath,
      timeout: config.ODAN_PDF_LAUNCH_TIMEOUT_MS,
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
      ],
    });
  } catch (error) {
    logger.error({ err: error }, "PDF browser launch failed");
    throw unavailable();
  }
}

function getBrowser(): Promise<Browser> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = undefined;
  if (!browserPromise) {
    const pending = launchBrowser();
    browserPromise = pending;
    void pending.then(
      (browser) => {
        browser.on("disconnected", () => {
          if (browserPromise === pending) browserPromise = undefined;
        });
      },
      () => {
        if (browserPromise === pending) browserPromise = undefined;
      },
    );
  }
  return browserPromise;
}

export async function closePdfBrowser(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = undefined;
  const pending = browserPromise;
  browserPromise = undefined;
  if (!pending) return;
  try {
    const browser = await pending;
    if (browser.connected) await browser.close();
  } catch (error) {
    logger.warn({ err: error }, "PDF browser cleanup failed");
  }
}

function scheduleIdleClose() {
  if (activeExports !== 0 || !browserPromise) return;
  idleTimer = setTimeout(() => void closePdfBrowser(), idleMilliseconds);
  idleTimer.unref();
}

export async function withPdfPage<T>(
  render: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser();
  activeExports += 1;
  let page: Page | undefined;
  try {
    page = await browser.newPage();
    return await render(page);
  } catch (error) {
    logger.error({ err: error }, "PDF rendering failed");
    throw unavailable();
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (error) {
        logger.warn({ err: error }, "PDF page cleanup failed");
      }
    }
    activeExports -= 1;
    scheduleIdleClose();
  }
}
