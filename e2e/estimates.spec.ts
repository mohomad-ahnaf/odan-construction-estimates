import { test, expect } from "@playwright/test";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
const env = dotenv.parse(
  readFileSync(new URL("../backend/.env", import.meta.url)),
);
process.env.DATABASE_URL = env.DATABASE_URL;
const db = new PrismaClient();
const ids: { client?: string; project?: string; estimate?: string } = {};
test.afterAll(async () => {
  if (ids.estimate)
    await db.estimate.deleteMany({ where: { id: ids.estimate } });
  if (ids.project) await db.project.deleteMany({ where: { id: ids.project } });
  if (ids.client) await db.client.deleteMany({ where: { id: ids.client } });
  await db.$disconnect();
});
test("responsive Client to Project to Estimate, Save, View, PDF and Excel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Email address").fill(env.ODAN_SEED_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(env.ODAN_SEED_PASSWORD);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("link", { name: "Add New Client" }).click();
  await page.getByLabel("Client name").fill(`E2E client ${Date.now()}`);
  await page.getByLabel("Contact person").fill("Test contact");
  await page.getByRole("button", { name: "Save client" }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]+$/);
  ids.client = page.url().match(/\/clients\/([0-9a-f-]+)/)?.[1];
  await expect(page.getByRole("heading", { name: /E2E client/ })).toBeVisible();
  await page.getByRole("link", { name: "Add Project" }).click();
  await page.getByLabel("Project name").fill("E2E residence");
  await page.getByLabel("Site address").fill("Test site");
  await page.getByRole("button", { name: "Save project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  ids.project = page.url().match(/\/projects\/([0-9a-f-]+)/)?.[1];
  await expect(
    page.getByRole("heading", { name: "E2E residence" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create Estimate" }).click();
  await expect(page.locator('select[name="clientId"]')).toHaveValue(ids.client!);
  await expect(page.locator('select[name="projectId"]')).toHaveValue(ids.project!);
  await page.getByLabel("Description 1").fill("Foundation concrete");
  await page.getByLabel("Quantity 1").fill("2.5");
  await page.getByLabel("Rate 1").fill("1000");
  await page.getByLabel("Tax (%)").fill("18");
  await page.getByRole("button", { name: /Save estimate/ }).click();
  await page.waitForURL(/\/estimates\/[0-9a-f-]+$/);
  ids.estimate = page.url().match(/\/estimates\/([0-9a-f-]+)/)?.[1];
  await expect(page.locator(".grand-total")).toContainText("2,950.00");
  for (const [label, extension, magic] of [
    ["Excel", ".xlsx", "PK"],
    ["PDF", ".pdf", "%PDF"],
  ]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: new RegExp(label) }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toContain(extension);
    expect(await download.failure()).toBeNull();
    const bytes = readFileSync((await download.path())!);
    expect(bytes.length).toBeGreaterThan(1024);
    expect(bytes.subarray(0, magic.length).toString()).toBe(magic);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Sign out/ }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});
