import { test, expect } from "@playwright/test";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
const env = dotenv.parse(
  readFileSync(new URL("../backend/.env", import.meta.url)),
);
test("sign in, create, edit, export, submit, approve and sign out", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill(env.ODAN_SEED_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(env.ODAN_SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(
    page.getByRole("heading", { name: "Estimates", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "＋ New estimate" }).click();
  await page.getByLabel("Project title").fill(`E2E residence ${Date.now()}`);
  await page.getByLabel("Client name").fill("E2E test client");
  await page.getByLabel("Description 1").fill("Foundation concrete");
  await page.getByLabel("Quantity 1").fill("2.5");
  await page.getByLabel("Rate 1").fill("1000");
  await page.getByLabel("Tax (%)").fill("18");
  await page.getByRole("button", { name: "Save estimate →" }).click();
  await expect(page.locator(".grand-total")).toContainText("2,950.00");
  await page.getByRole("link", { name: "Edit estimate", exact: true }).click();
  await page.getByLabel("Quantity 1").fill("3");
  await page.getByRole("button", { name: "Save estimate →" }).click();
  await expect(page.locator(".grand-total")).toContainText("3,540.00");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    path: "test-results/estimate-detail.png",
    fullPage: true,
  });
  for (const format of ["Excel ↓", "PDF ↓"]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: format }).click();
    const file = await download;
    expect(await file.failure()).toBeNull();
    expect(file.suggestedFilename()).toMatch(/\.xlsx$|\.pdf$/);
    const downloaded = readFileSync((await file.path())!);
    expect(downloaded.length).toBeGreaterThan(1024);
    expect(
      downloaded
        .subarray(0, file.suggestedFilename().endsWith(".pdf") ? 4 : 2)
        .toString(),
    ).toBe(file.suggestedFilename().endsWith(".pdf") ? "%PDF" : "PK");
  }
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.locator(".status")).toContainText("Sent");
  await page
    .getByRole("button", { name: "Approve estimate", exact: true })
    .click();
  await expect(page.locator(".status")).toContainText("Approved");
  await expect(
    page.getByRole("link", { name: "Edit estimate", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out →" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});
test("mobile sign-in remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-login.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
