/**
 * Representative school detail screenshots (golden + fixtures + optional VERIFY_SAMPLE_UDISES).
 * Runs with e2e:release; uses live API data only.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const shotDir = path.join(process.cwd(), "e2e", "screenshots-output", "release-sample");
const GOLDEN = process.env.SCHOOL_UDISE?.trim() || "11050300101";

const DEFAULT_SAMPLE = ["21040100801", "09030101501"];
const EXTRA = (process.env.VERIFY_SAMPLE_UDISES || "")
  .split(",")
  .map((s) => s.trim())
  .filter((u) => /^\d{11}$/.test(u));

function sampleUdises(): string[] {
  const set = new Set<string>([GOLDEN, ...DEFAULT_SAMPLE, ...EXTRA]);
  return [...set];
}

test.beforeAll(() => {
  fs.mkdirSync(shotDir, { recursive: true });
});

test("release sampling: login + detail pages for representative UDISEs", async ({ page, request }) => {
  test.setTimeout(180_000);

  const udises = sampleUdises();
  for (const u of udises) {
    const check = await request.get(`/api/schools/${u}`);
    if (!check.ok()) continue;
  }

  await page.goto("/login");
  await page.getByLabel("Rollcode").fill("founder");
  await page.getByLabel("Password").fill("change-me-in-prod");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(map|dashboard)/, { timeout: 30_000 });

  let captured = 0;
  for (const u of udises) {
    const res = await request.get(`/api/schools/${u}`);
    if (!res.ok()) continue;

    const body = (await res.json()) as {
      enrolmentSocial: unknown[];
      school: { enrolmentHeadcount: { totalStudents: number | null } };
    };

    await page.goto(`/schools/${u}`);
    await expect(page).toHaveURL(new RegExp(`/schools/${u}`));

    const hasSocial = (body.enrolmentSocial?.length ?? 0) > 0;
    if (u === GOLDEN || hasSocial) {
      await expect(page.locator("body")).not.toContainText(
        "No enrolment breakdown in the database for this school yet.",
        { timeout: 12_000 },
      );
    }

    const chartSurface = (title: string) =>
      page.locator("section").filter({ has: page.getByRole("heading", { name: title }) }).locator("svg.recharts-surface");

    const hasStudents = (body.school?.enrolmentHeadcount?.totalStudents ?? 0) > 0;
    if (hasStudents && hasSocial) {
      await expect(chartSurface("Social category").first()).toBeVisible({ timeout: 20_000 });
    }

    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shotDir, `school-${u}.png`), fullPage: true });
    captured++;
  }

  expect(captured, "at least golden school detail screenshot").toBeGreaterThan(0);
});
