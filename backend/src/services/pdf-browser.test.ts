import { afterEach, expect, it, vi } from "vitest";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { closePdfBrowser, withPdfPage } from "./pdf-browser.js";

vi.mock("puppeteer", () => ({
  default: {
    executablePath: vi.fn(() => process.execPath),
    launch: vi.fn(),
  },
}));

afterEach(async () => {
  await closePdfBrowser();
  vi.clearAllMocks();
});

it("returns a controlled error when Chromium cannot launch", async () => {
  vi.mocked(puppeteer.launch).mockRejectedValueOnce(
    new Error("simulated launch failure"),
  );
  await expect(withPdfPage(async () => "unused")).rejects.toMatchObject({
    status: 503,
    message: "PDF export is temporarily unavailable",
  });
});

it("reuses one browser and closes every page", async () => {
  const page = {
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
  const browser = {
    connected: true,
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  } as unknown as Browser;
  vi.mocked(puppeteer.launch).mockResolvedValueOnce(browser);
  expect(await withPdfPage(async () => "first")).toBe("first");
  expect(await withPdfPage(async () => "second")).toBe("second");
  expect(puppeteer.launch).toHaveBeenCalledTimes(1);
  expect(page.close).toHaveBeenCalledTimes(2);
  await closePdfBrowser();
  expect(browser.close).toHaveBeenCalledTimes(1);
});

it("closes the page when PDF rendering fails", async () => {
  const page = {
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
  const browser = {
    connected: true,
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  } as unknown as Browser;
  vi.mocked(puppeteer.launch).mockResolvedValueOnce(browser);
  await expect(
    withPdfPage(async () => {
      throw new Error("simulated render failure");
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(page.close).toHaveBeenCalledTimes(1);
});
