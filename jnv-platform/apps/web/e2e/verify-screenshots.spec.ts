/**
 * Full-stack verification + screenshots.
 * Authenticated shots run in ONE test so the session cookie is preserved (Playwright isolates context per test by default).
 * Output: e2e/screenshots-output/*.png (gitignored). Run: npm run e2e:verify (uses --workers=1).
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Use cwd (apps/web when running `npm run e2e:verify -w @jnv/web`). `import.meta.url` can point at
// Playwright’s transformed copy of this file, which would write screenshots outside the repo.
const shotDir = path.join(process.cwd(), "e2e", "screenshots-output");

test.beforeAll(() => {
  fs.mkdirSync(shotDir, { recursive: true });
});

test("API health via Vite proxy", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const j = (await res.json()) as { ok: boolean };
  expect(j.ok).toBe(true);
});

test("API dashboard summary (JSON)", async ({ request }) => {
  const res = await request.get("/api/dashboard/summary");
  expect(res.ok()).toBeTruthy();
  const j = (await res.json()) as { totalSchools: number };
  expect(typeof j.totalSchools).toBe("number");
});

test("API dashboard progress (JSON)", async ({ request }) => {
  const res = await request.get("/api/dashboard/progress");
  expect(res.ok()).toBeTruthy();
  const j = (await res.json()) as { totalSchools: number; schoolsPipelineDone: number };
  expect(typeof j.totalSchools).toBe("number");
  expect(typeof j.schoolsPipelineDone).toBe("number");
});

test("UI: login + all pages (screenshots)", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /founder login/i })).toBeVisible();
  await page.screenshot({ path: path.join(shotDir, "01-login-page.png"), fullPage: true });

  await page.getByLabel("Rollcode").fill("founder");
  await page.getByLabel("Password").fill("change-me-in-prod");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, "02-dashboard.png"), fullPage: true });

  await page.goto("/map");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotDir, "03-map.png"), fullPage: true });

  await page.goto("/schools");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shotDir, "04-schools-list.png"), fullPage: true });

  const list = await request.get("/api/schools?page=1&pageSize=2");
  expect(list.ok()).toBeTruthy();
  const data = (await list.json()) as { items: { udise: string }[] };
  const udise = data.items[0]?.udise ?? "00000000000";
  const udise2 = data.items[1]?.udise;
  await page.goto(`/schools/${udise}`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(shotDir, "05-school-detail.png"), fullPage: true });

  await page.goto("/revenue");
  await expect(page.getByRole("heading", { name: /revenue lab/i })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotDir, "06-revenue.png"), fullPage: true });

  await page.goto("/progress");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, "07-progress.png"), fullPage: true });

  const compareUrl =
    udise2 && udise !== udise2 ? `/compare?u=${encodeURIComponent(udise)}&u=${encodeURIComponent(udise2)}` : "/compare";
  await page.goto(compareUrl);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shotDir, "08-compare.png"), fullPage: true });

  await page.goto("/reports");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, "09-reports.png"), fullPage: true });

  await page.goto("/settings");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, "10-settings.png"), fullPage: true });
});
