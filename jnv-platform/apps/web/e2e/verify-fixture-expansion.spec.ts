/**
 * Release gate for expansion fixtures (not golden 11050300101 — that stays in verify-screenshots.spec.ts).
 * Requires verify:stack (or golden PDF script + import) so crawler pdfs include secondary + regional PDFs.
 */
import { expect, test } from "@playwright/test";

const SECOND_UDISE = process.env.SECOND_SCHOOL_UDISE?.trim() || "21040100801";
const REGION_UDISE = process.env.REGION_SCHOOL_UDISE?.trim() || "09030101501";
const GOLDEN_UDISE = "11050300101";

type SnapPayload = {
  schemaVersion: number;
  structured?: unknown;
  confidenceBySection?: Record<string, number | undefined>;
  provenance?: { academicYear?: string | null; parserVersion?: string; pages?: number; usedOcr?: boolean };
};

async function assertExpansionDetail(
  request: { get: (url: string) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }> },
  udise: string,
  totals: { t: number; b: number; g: number },
) {
  await request.get(`/api/schools/${udise}`);
  const t0 = Date.now();
  const res = await request.get(`/api/schools/${udise}`);
  expect(Date.now() - t0).toBeLessThan(300);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    school: {
      udise: string;
      enrolmentHeadcount: { totalStudents: number | null; totalBoys: number | null; totalGirls: number | null };
      provenance: { parsingStatus: string; reportSnapshot?: { payload?: SnapPayload } };
    };
    enrolmentSocial: { category: string; total: number | null }[];
    enrolmentMinority: unknown[];
    enrolmentOthers: unknown[];
    enrolmentAge: { ageBand: string; total: number | null }[];
    extractionConfidence: number | null;
    pdfPath: string | null;
  };
  expect(body.school.udise).toBe(udise);
  expect(body.school.provenance.parsingStatus).toBe("COMPLETE");
  expect(body.extractionConfidence).toBeGreaterThanOrEqual(0.65);
  expect(body.pdfPath).toBeTruthy();
  expect(body.school.enrolmentHeadcount.totalStudents).toBe(totals.t);
  expect(body.school.enrolmentHeadcount.totalBoys).toBe(totals.b);
  expect(body.school.enrolmentHeadcount.totalGirls).toBe(totals.g);
  const soc = Object.fromEntries(body.enrolmentSocial.map((r) => [r.category, r.total]));
  expect(soc["SC"]! + soc["ST"]! + soc["OBC"]! + soc["General"]!).toBe(totals.t);
  const ageMap = Object.fromEntries(body.enrolmentAge.map((r) => [r.ageBand, r.total]));
  let ageSum = 0;
  for (const b of ["10", "11", "12", "13", "14", "15", "16", "17", "18"]) ageSum += ageMap[b] ?? 0;
  expect(ageSum).toBe(totals.t);
  expect(body.enrolmentMinority.length).toBeGreaterThan(0);
  expect(body.enrolmentOthers.length).toBeGreaterThan(0);
  const payload = body.school.provenance.reportSnapshot?.payload;
  expect(payload?.schemaVersion).toBe(2);
  expect(JSON.stringify(payload).length).toBeGreaterThan(80);
  expect(payload?.confidenceBySection).toBeTruthy();
  expect(typeof payload?.provenance?.pages).toBe("number");
  expect(payload?.provenance?.usedOcr).toBe(false);
}

test("Expansion: secondary school API + PDF + list drilldown by student band", async ({ request }) => {
  await assertExpansionDetail(request, SECOND_UDISE, { t: 318, b: 155, g: 163 });
  const pdf = await request.get(`/api/schools/${SECOND_UDISE}/pdf`);
  expect(pdf.status()).toBe(200);
  const ctRaw = pdf.headers()["content-type"];
  const ct = Array.isArray(ctRaw) ? ctRaw.join(";") : String(ctRaw ?? "");
  expect(ct).toContain("application/pdf");

  const narrow = await request.get(`/api/schools?minStudents=310&maxStudents=325&page=1&pageSize=20`);
  expect(narrow.ok()).toBeTruthy();
  const list = (await narrow.json()) as { items: { udise: string; totalStudents: number | null }[] };
  expect(list.items.some((x) => x.udise === SECOND_UDISE)).toBe(true);
});

test("Expansion: regional school API + PDF + narrow list band", async ({ request }) => {
  await assertExpansionDetail(request, REGION_UDISE, { t: 186, b: 92, g: 94 });
  const pdf = await request.get(`/api/schools/${REGION_UDISE}/pdf`);
  expect(pdf.status()).toBe(200);

  const narrow = await request.get(`/api/schools?minStudents=180&maxStudents=190&page=1&pageSize=20`);
  expect(narrow.ok()).toBeTruthy();
  const list = (await narrow.json()) as { items: { udise: string }[] };
  expect(list.items.some((x) => x.udise === REGION_UDISE)).toBe(true);
});

test("Expansion: compare golden + secondary returns two schools", async ({ request }) => {
  const res = await request.get(
    `/api/schools/compare?u=${encodeURIComponent(GOLDEN_UDISE)}&u=${encodeURIComponent(SECOND_UDISE)}`,
  );
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { schools: { udise: string }[] };
  expect(body.schools.length).toBe(2);
  const u = new Set(body.schools.map((s) => s.udise));
  expect(u.has(GOLDEN_UDISE)).toBe(true);
  expect(u.has(SECOND_UDISE)).toBe(true);
});

test("Expansion: dashboard overview includes multiple schools", async ({ request }) => {
  const res = await request.get("/api/dashboard/overview");
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { totalSchools: number };
  expect(body.totalSchools).toBeGreaterThanOrEqual(3);
});

test("Expansion: map aggregates sum to total school count", async ({ request }) => {
  const res = await request.get("/api/dashboard/map");
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { meta: { totalSchools: number }; states: { schoolCount: number }[] };
  expect(body.meta.totalSchools).toBeGreaterThanOrEqual(3);
  const sumStates = body.states.reduce((a, s) => a + s.schoolCount, 0);
  expect(sumStates).toBe(body.meta.totalSchools);
});

test("Expansion: secondary school detail UI — live API, charts, headcounts", async ({ page, request }) => {
  const check = await request.get(`/api/schools/${SECOND_UDISE}`);
  expect(check.ok(), `Secondary UDISE ${SECOND_UDISE} must exist (run verify:stack)`).toBeTruthy();

  let apiGets = 0;
  page.on("request", (req) => {
    const u = req.url();
    if (req.method() === "GET" && u.includes(`/api/schools/${SECOND_UDISE}`) && !u.includes("/pdf")) apiGets += 1;
  });

  await page.goto("/login");
  await page.getByLabel("Rollcode").fill("founder");
  await page.getByLabel("Password").fill("change-me-in-prod");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(map|dashboard)/, { timeout: 30_000 });

  await page.goto(`/schools/${SECOND_UDISE}`);
  await expect(page.locator("body")).toContainText("318", { timeout: 20_000 });
  await expect(page.locator("body")).toContainText("155");
  await expect(page.locator("body")).toContainText("163");
  expect(apiGets).toBeGreaterThan(0);

  const chartSurface = (title: string) =>
    page.locator("section").filter({ has: page.getByRole("heading", { name: title }) }).locator("svg.recharts-surface");
  await expect(chartSurface("Social category").first()).toBeVisible({ timeout: 15_000 });
  await expect(chartSurface("Minority").first()).toBeVisible();
  await expect(chartSurface("Age distribution").first()).toBeVisible();
});
