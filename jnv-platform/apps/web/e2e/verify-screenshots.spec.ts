/**
 * Full-stack verification + screenshots + release gate.
 * Release gate (API + PDF + latency + UI charts + live /api/schools fetch): fails `npm run e2e:verify` / `npm run test:release-gate` if broken.
 * Parser non-invocation on GET detail is enforced in Vitest: `pdf-extraction.integration.test.ts` (tmp DB after fixture import).
 * Authenticated shots run in ONE test so the session cookie is preserved (Playwright isolates context per test by default).
 * Output: e2e/screenshots-output/*.png (gitignored). Run: npm run e2e:verify (uses --workers=1).
 *
 * Golden UDISE 11050300101 is ensured by verify:stack (copies report-card-sample.pdf into crawler pdfs before import).
 * Additional fixtures (21040100801, 09030101501) and E2E: see verify-fixture-expansion.spec.ts (same npm run e2e:verify).
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const shotDir = path.join(process.cwd(), "e2e", "screenshots-output");

/** Same as import fixture — must exist after `npm run verify:stack`. */
const GOLDEN_UDISE = process.env.SCHOOL_UDISE?.trim() || "11050300101";

type SnapPayload = {
  schemaVersion: number;
  structured?: {
    enrolmentSocial?: { sc?: number | null; st?: number | null; obc?: number | null; general?: number | null; total?: number | null };
    students?: { total?: number; boys?: number; girls?: number };
    enrolmentAge?: Record<string, number | null>;
  };
  confidenceBySection?: Record<string, number | undefined>;
  provenance?: {
    academicYear?: string | null;
    parserVersion?: string;
    pages?: number;
    usedOcr?: boolean;
  };
};

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

test("Release gate: GET golden school detail JSON + snapshot + consistency + latency", async ({ request }) => {
  await request.get(`/api/schools/${GOLDEN_UDISE}`);
  const t0 = Date.now();
  const res = await request.get(`/api/schools/${GOLDEN_UDISE}`);
  const ms = Date.now() - t0;
  expect(res.ok(), `GET /api/schools/${GOLDEN_UDISE} must be 200 after verify:stack import`).toBeTruthy();
  expect(ms, `Release gate: school detail API must be <300ms after warm-up (got ${ms}ms)`).toBeLessThan(300);

  const body = (await res.json()) as {
    school: {
      udise: string;
      enrolmentHeadcount: { totalStudents: number | null; totalBoys: number | null; totalGirls: number | null };
      provenance: {
        overallExtractionConfidence: number | null;
        parsingStatus: string;
        reportSnapshot?: { payload?: SnapPayload };
      };
    };
    enrolmentSocial: { category: string; total: number | null }[];
    enrolmentMinority: { category: string; total: number | null }[];
    enrolmentOthers: { category: string; total: number | null }[];
    enrolmentAge: { ageBand: string; total: number | null }[];
    extractionConfidence: number | null;
    pdfPath: string | null;
  };

  expect(body.school.udise).toBe(GOLDEN_UDISE);
  expect(body.school.provenance.parsingStatus).toBe("COMPLETE");
  expect(body.extractionConfidence ?? body.school.provenance.overallExtractionConfidence).toBeGreaterThanOrEqual(0.8);
  expect(body.pdfPath).toBeTruthy();

  expect(body.school.enrolmentHeadcount.totalStudents).toBe(445);
  expect(body.school.enrolmentHeadcount.totalBoys).toBe(220);
  expect(body.school.enrolmentHeadcount.totalGirls).toBe(225);

  const soc = Object.fromEntries(body.enrolmentSocial.map((r) => [r.category, r.total]));
  expect(soc["SC"]! + soc["ST"]! + soc["OBC"]! + soc["General"]!).toBe(445);
  expect(soc["Total"]).toBe(445);

  const ageMap = Object.fromEntries(body.enrolmentAge.map((r) => [r.ageBand, r.total]));
  let ageSum = 0;
  for (const b of ["10", "11", "12", "13", "14", "15", "16", "17", "18"]) {
    ageSum += ageMap[b] ?? 0;
  }
  expect(ageSum).toBe(445);
  expect(ageMap["Total"]).toBe(445);

  expect(body.enrolmentMinority.length).toBeGreaterThan(0);
  expect(body.enrolmentOthers.length).toBeGreaterThan(0);

  const payload = body.school.provenance.reportSnapshot?.payload;
  expect(payload, "reportSnapshot.payload must exist").toBeTruthy();
  expect(JSON.stringify(payload).length, "reportSnapshot.payload must not be empty").toBeGreaterThan(80);
  expect(payload!.schemaVersion, "schemaVersion must exist on snapshot payload").toBe(2);
  expect(payload!.structured).toBeTruthy();
  expect(payload!.confidenceBySection).toBeTruthy();
  expect(payload!.provenance?.parserVersion).toBeTruthy();
  expect(payload!.provenance?.academicYear).toBeTruthy();
  expect(typeof payload!.provenance?.pages).toBe("number");
  expect(payload!.provenance?.usedOcr).toBe(false);
});

test("Release gate: GET golden school PDF returns 200", async ({ request }) => {
  const res = await request.get(`/api/schools/${GOLDEN_UDISE}/pdf`);
  expect(res.status(), `GET /api/schools/${GOLDEN_UDISE}/pdf must be 200`).toBe(200);
  const ct = res.headers()["content-type"] ?? "";
  expect(ct).toContain("application/pdf");
});

test("UI: login + all pages (screenshots)", async ({ page, request }) => {
  test.setTimeout(120_000);
  const goldenRes = await request.get(`/api/schools/${GOLDEN_UDISE}`);
  expect(goldenRes.ok(), `Golden UDISE ${GOLDEN_UDISE} required for UI verify`).toBeTruthy();

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /founder login/i })).toBeVisible();
  await page.screenshot({ path: path.join(shotDir, "01-login-page.png"), fullPage: true });

  await page.getByLabel("Rollcode").fill("founder");
  await page.getByLabel("Password").fill("change-me-in-prod");
  await page.getByRole("button", { name: /sign in/i }).click();
  /** LoginPage navigates to `/map` on success (not `/dashboard`). */
  await expect(page).toHaveURL(/\/(map|dashboard)/, { timeout: 30_000 });

  await page.goto("/dashboard");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, "02-dashboard.png"), fullPage: true });

  await page.goto("/map");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotDir, "03-map.png"), fullPage: true });

  await page.goto("/schools");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shotDir, "04-schools-list.png"), fullPage: true });

  /** Release gate: school detail must load real API data (not embedded mocks). */
  let schoolDetailApiGets = 0;
  page.on("request", (req) => {
    const u = req.url();
    if (req.method() !== "GET") return;
    if (u.includes(`/api/schools/${GOLDEN_UDISE}`) && !u.includes("/pdf")) schoolDetailApiGets += 1;
  });

  await page.goto(`/schools/${GOLDEN_UDISE}`);
  await expect(page).toHaveURL(new RegExp(`/schools/${GOLDEN_UDISE}`));
  await expect(page.locator("body")).toContainText("445", { timeout: 20_000 });
  await expect(page.locator("body")).toContainText("220");
  await expect(page.locator("body")).toContainText("225");
  await expect(page.locator("body")).not.toContainText("No enrolment breakdown in the database for this school yet.");
  expect(schoolDetailApiGets, "School detail page must fetch GET /api/schools/:udise (no mock-only data path)").toBeGreaterThan(
    0,
  );

  const chartSurface = (title: string) =>
    page.locator("section").filter({ has: page.getByRole("heading", { name: title }) }).locator("svg.recharts-surface");
  await expect(chartSurface("Social category").first()).toBeVisible({ timeout: 15_000 });
  await expect(chartSurface("Minority").first()).toBeVisible();
  await expect(chartSurface("Age distribution").first()).toBeVisible();

  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shotDir, "05-school-detail.png"), fullPage: true });

  const list = await request.get("/api/schools?page=1&pageSize=10");
  expect(list.ok()).toBeTruthy();
  const data = (await list.json()) as { items: { udise: string }[] };
  const udise2 = data.items.find((x) => x.udise !== GOLDEN_UDISE)?.udise;

  await page.goto("/revenue");
  await expect(page.getByRole("heading", { name: /revenue lab/i })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotDir, "06-revenue.png"), fullPage: true });

  await page.goto("/progress");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, "07-progress.png"), fullPage: true });

  const compareUrl =
    udise2 && udise2 !== GOLDEN_UDISE
      ? `/compare?u=${encodeURIComponent(GOLDEN_UDISE)}&u=${encodeURIComponent(udise2)}`
      : "/compare?u=11050300101&u=11050300102";
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
