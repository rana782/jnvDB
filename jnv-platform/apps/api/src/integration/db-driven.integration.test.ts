/**
 * DB-driven contract tests: no in-memory mocks of school data.
 * Uses apps/api/prisma/dev.db (explicit DATABASE_URL) so results reflect whatever is loaded (seed/import).
 *
 * Parser golden-path accuracy lives in `modules/import/pdf-extraction.integration.test.ts` (real PDF → tmp DB → API).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { clearEnvCacheForTests } from "../config/env.js";
import {
  dashboardOverview,
  dashboardProgress,
  dashboardSummary,
} from "../modules/analytics/dashboard.service.js";
import { effectiveHeadcountFromRow } from "../shared/effective-school-headcount.js";
import { inferNvsRegionFromDisplayState } from "../data/nvs-states-regions.js";
import { effectiveDisplayState } from "../modules/map/map-aggregate-core.js";
import { calculateRevenue } from "../modules/analytics/revenue-calculator.js";
import { mapStateAggregates } from "../modules/map/map.service.js";
import { computeRevenueProjection } from "../modules/analytics/revenue-projection.service.js";
import { patchSchoolStatus } from "../modules/schools/schools.service.js";
import { getPrisma, resetPrismaForTests } from "../shared/prisma.js";
import { PIPELINE_STATUS_VALUES } from "../shared/pipeline-status.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE_PDF = path.join(API_ROOT, "test", "fixtures", "report-card-sample.pdf");
const DEV_DB_PATH = path.join(API_ROOT, "prisma", "dev.db");
const DEV_DB_URL = `file:${DEV_DB_PATH.replace(/\\/g, "/")}`;

let savedDatabaseUrl: string | undefined;

describe("DB-driven platform checks (dev.db)", () => {
  beforeAll(async () => {
    savedDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = DEV_DB_URL;
    clearEnvCacheForTests();
    await resetPrismaForTests();
  });

  afterAll(async () => {
    process.env.DATABASE_URL = savedDatabaseUrl;
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    clearEnvCacheForTests();
    await resetPrismaForTests();
  });

  it("parser: golden fixture PDF exists (repo artifact for accuracy tests elsewhere)", () => {
    expect(fs.existsSync(FIXTURE_PDF)).toBe(true);
  });

  it("DB: dev database file exists", () => {
    expect(fs.existsSync(DEV_DB_PATH)).toBe(true);
  });

  it("DB + API: school counts and list total align", async () => {
    const prisma = getPrisma();
    const dbCount = await prisma.school.count();
    const app = await buildApp();
    try {
      const res = await app.inject({ method: "GET", url: "/api/schools?page=1&pageSize=1" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { total: number };
      expect(body.total).toBe(dbCount);
    } finally {
      await app.close();
    }
  });

  it("DB + API: dashboard summary matches effective headcount + model revenue rules", async () => {
    const prisma = getPrisma();
    const [count, doneCount, rows] = await Promise.all([
      prisma.school.count(),
      prisma.school.count({ where: { pipelineStatus: "DONE" } }),
      prisma.school.findMany({
        select: {
          geographicState: true,
          apiStateName: true,
          stateId: true,
          totalStudents: true,
          totalBoys: true,
          totalGirls: true,
          enrolmentSocial: {
            where: { category: "Total" },
            take: 1,
            select: { total: true, boys: true, girls: true },
          },
          revenueScenarios: {
            where: { kind: "CUSTOM" },
            orderBy: { computedAt: "desc" },
            take: 1,
            select: { monthlyRevenue: true, annualRevenue: true },
          },
        },
      }),
    ]);

    let expectedStudents = 0;
    let expectedMonthly = 0;
    let expectedAnnual = 0;
    let expectedWithHead = 0;
    let expectedLinked = 0;

    for (const s of rows) {
      const head = effectiveHeadcountFromRow(s);
      expectedStudents += head.total;
      if (head.total > 0) expectedWithHead += 1;
      const display = effectiveDisplayState(s);
      if (s.stateId != null || inferNvsRegionFromDisplayState(display) != null) expectedLinked += 1;

      const sm = s.revenueScenarios[0]?.monthlyRevenue;
      const sa = s.revenueScenarios[0]?.annualRevenue;
      if (sm != null && sm > 0) {
        expectedMonthly += sm;
        expectedAnnual += sa != null && sa > 0 ? sa : sm * 12;
      } else if (head.total > 0) {
        const r = calculateRevenue({
          totalStudents: head.total,
          boys: head.boys,
          girls: head.girls,
          pricePerWash: 30,
          adoptionRate: 0.85,
          washesPerStudentPerMonth: 4,
        });
        expectedMonthly += r.monthlyRevenue;
        expectedAnnual += r.annualRevenue;
      }
    }

    const summary = await dashboardSummary();
    expect(summary.totalSchools).toBe(count);
    expect(summary.schoolsCompleted).toBe(doneCount);
    expect(summary.totalStudents).toBe(expectedStudents);
    expect(summary.schoolsWithStudentHeadcount).toBe(expectedWithHead);
    expect(summary.schoolsLinkedToNvsRegion).toBe(expectedLinked);
    expect(summary.portfolioMonthlyRevenue).toBe(Math.round(expectedMonthly * 100) / 100);
    expect(summary.portfolioAnnualRevenue).toBe(Math.round(expectedAnnual * 100) / 100);

    const app = await buildApp();
    try {
      const res = await app.inject({ method: "GET", url: "/api/dashboard/summary" });
      expect(res.statusCode).toBe(200);
      const api = res.json() as typeof summary;
      expect(api).toEqual(summary);
    } finally {
      await app.close();
    }
  });

  it("DB + service: dashboard overview chart bucket counts sum to school total", async () => {
    const prisma = getPrisma();
    const n = await prisma.school.count();
    const overview = await dashboardOverview();
    expect(overview.totalSchools).toBe(n);
    const rSum = overview.charts.revenueDistribution.reduce((a, b) => a + b.count, 0);
    const rdSum = overview.charts.readinessDistribution.reduce((a, b) => a + b.count, 0);
    expect(rSum).toBe(n);
    expect(rdSum).toBe(n);
  });

  it("API: dashboard overview matches service payload", async () => {
    const overview = await dashboardOverview();
    const app = await buildApp();
    try {
      const res = await app.inject({ method: "GET", url: "/api/dashboard/overview" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(overview);
    } finally {
      await app.close();
    }
  });

  it("DB + service: progress pipeline histogram sums to total schools", async () => {
    const prisma = getPrisma();
    const n = await prisma.school.count();
    const prog = await dashboardProgress();
    expect(prog.totalSchools).toBe(n);
    const pipeSum = Object.values(prog.pipeline).reduce((a, v) => a + v, 0);
    expect(pipeSum).toBe(n);
    const parseSum = Object.values(prog.parsing).reduce((a, v) => a + v, 0);
    expect(parseSum).toBe(n);
  });

  it("Map: state aggregates cover every school once", async () => {
    const prisma = getPrisma();
    const n = await prisma.school.count();
    const agg = await mapStateAggregates({}, "jnv_count");
    expect(agg.meta.totalSchools).toBe(n);
    const sumStates = agg.states.reduce((a, s) => a + s.schoolCount, 0);
    expect(sumStates).toBe(n);

    const app = await buildApp();
    try {
      const res = await app.inject({ method: "GET", url: "/api/dashboard/map" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as typeof agg;
      expect(body.meta.totalSchools).toBe(n);
      expect(body.states.reduce((a, s) => a + s.schoolCount, 0)).toBe(n);
    } finally {
      await app.close();
    }
  });

  it("Revenue: projection portfolio school count matches DB; summary uses hybrid portfolio model", async () => {
    const prisma = getPrisma();
    const n = await prisma.school.count();
    const proj = await computeRevenueProjection({});
    expect(proj.portfolio.schoolCount).toBe(n);

    const summary = await dashboardSummary();
    expect(summary.portfolioMonthlyRevenue).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(summary.portfolioMonthlyRevenue)).toBe(true);
  });

  it("Progress updates: patchSchoolStatus writes DB and progress event; then restores", async () => {
    const prisma = getPrisma();
    const actor = await prisma.founderUser.findFirst({ where: { isActive: true } });
    const school = await prisma.school.findFirst();
    if (!actor || !school) {
      return;
    }

    const original = school.pipelineStatus;
    const alternatives = PIPELINE_STATUS_VALUES.filter((s) => s !== original);
    if (alternatives.length === 0) {
      return;
    }
    const next = alternatives[0]!;

    const beforeEvents = await prisma.schoolProgress.count({ where: { udise: school.udise } });

    await patchSchoolStatus(school.udise, { pipelineStatus: next }, actor.id);

    const updated = await prisma.school.findUniqueOrThrow({ where: { udise: school.udise } });
    expect(updated.pipelineStatus).toBe(next);

    const afterEvents = await prisma.schoolProgress.count({ where: { udise: school.udise } });
    expect(afterEvents).toBeGreaterThanOrEqual(beforeEvents + 1);

    const last = await prisma.schoolProgress.findFirst({
      where: { udise: school.udise },
      orderBy: { createdAt: "desc" },
    });
    expect(last?.toStatus).toBe(next);
    expect(last?.fromStatus).toBe(original);

    await patchSchoolStatus(school.udise, { pipelineStatus: original }, actor.id);
    const restored = await prisma.school.findUniqueOrThrow({ where: { udise: school.udise } });
    expect(restored.pipelineStatus).toBe(original);
  });
});
