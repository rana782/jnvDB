import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCached, setCached } from "../../shared/response-cache.js";
import { getPrisma } from "../../shared/prisma.js";
import { postRevenueCalculate } from "../schools/schools.service.js";
import { deploymentStrategyDashboard } from "./deployment.service.js";
import { dashboardOverview, dashboardProgress, dashboardSummary } from "./dashboard.service.js";
import {
  computeRevenueProjection,
  revenueProjectionBodySchema,
} from "./revenue-projection.service.js";
import { scenarioPresets, calculateRevenue, revenueInputSchema } from "./revenue-calculator.js";

const DASH_OVERVIEW_TTL_MS = 45_000;
const DASH_DEPLOY_TTL_MS = 30_000;
const DASH_OVERVIEW_KEY = "dash:overview:main";

const deploymentQuerySchema = z.object({
  state: z.string().optional(),
  regionId: z.string().optional(),
  minReadiness: z.coerce.number().min(0).max(100).optional(),
  maxReadiness: z.coerce.number().min(0).max(100).optional(),
  minMonthlyRevenue: z.coerce.number().min(0).optional(),
  maxMonthlyRevenue: z.coerce.number().min(0).optional(),
  topLimit: z.coerce.number().int().min(10).max(100).optional().default(50),
});

function deploymentCacheKey(q: z.infer<typeof deploymentQuerySchema>): string {
  const entries = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("&");
  return `dash:deploy:${entries}`;
}

export const registerAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/summary", async () => dashboardSummary());

  /** Summary KPIs + top states/regions + chart series for the main dashboard. */
  app.get("/dashboard/overview", async () => {
    const cached = getCached<Awaited<ReturnType<typeof dashboardOverview>>>(DASH_OVERVIEW_KEY);
    if (cached !== undefined) return cached;
    const body = await dashboardOverview();
    setCached(DASH_OVERVIEW_KEY, body, DASH_OVERVIEW_TTL_MS);
    return body;
  });

  app.get("/dashboard/progress", async () => dashboardProgress());

  /**
   * Deployment strategy: priority scores (readiness, students, infra, digital), filtered aggregates,
   * top schools table, state revenue summary, readiness distribution, next targets.
   */
  app.get("/dashboard/deployment", async (request) => {
    const q = deploymentQuerySchema.parse(request.query);
    const key = deploymentCacheKey(q);
    const cached = getCached<Awaited<ReturnType<typeof deploymentStrategyDashboard>>>(key);
    if (cached !== undefined) return cached;
    const filters = {
      state: q.state,
      regionId: q.regionId,
      minReadiness: q.minReadiness,
      maxReadiness: q.maxReadiness,
      minMonthlyRevenue: q.minMonthlyRevenue,
      maxMonthlyRevenue: q.maxMonthlyRevenue,
    };
    const body = await deploymentStrategyDashboard(filters, { topLimit: q.topLimit });
    setCached(key, body, DASH_DEPLOY_TTL_MS);
    return body;
  });

  /** Same payload as `/dashboard/progress` — portfolio pipeline summary + revenue from DONE schools (CUSTOM scenario). */
  app.get("/progress/summary", async () => dashboardProgress());

  app.post("/revenue/calculate", async (request) => {
    const body = z
      .object({
        udise: z.string(),
        adoptionRate: z.number().optional(),
        occupancyRate: z.number().optional(),
        pricePerWash: z.number().optional(),
        washesPerStudentPerMonth: z.number().optional(),
      })
      .parse(request.body);
    return postRevenueCalculate(body);
  });

  app.post("/revenue/projection", async (request) => {
    const body = revenueProjectionBodySchema.parse(request.body);
    return computeRevenueProjection(body);
  });

  app.get("/revenue/portfolio", async () => {
    const prisma = getPrisma();
    const scenarios = await prisma.schoolRevenueScenario.findMany({
      where: { kind: "CUSTOM" },
      select: { monthlyRevenue: true, annualRevenue: true },
    });
    const monthly = scenarios.reduce((a, s) => a + (s.monthlyRevenue ?? 0), 0);
    const annual = scenarios.reduce((a, s) => a + (s.annualRevenue ?? 0), 0);
    return { monthly, annual, scenarioRows: scenarios.length };
  });

  app.post("/revenue/scenarios", async (request) => {
    const raw = (request.body ?? {}) as Record<string, unknown>;
    const base = revenueInputSchema.parse(raw);
    const presetOverrides = z
      .object({
        LOW: z
          .object({
            pricePerWash: z.number().positive().optional(),
            washesPerStudentPerMonth: z.number().nonnegative().optional(),
            adoptionRate: z.number().min(0).max(1).optional(),
          })
          .optional(),
        MEDIUM: z
          .object({
            pricePerWash: z.number().positive().optional(),
            washesPerStudentPerMonth: z.number().nonnegative().optional(),
            adoptionRate: z.number().min(0).max(1).optional(),
          })
          .optional(),
        HIGH: z
          .object({
            pricePerWash: z.number().positive().optional(),
            washesPerStudentPerMonth: z.number().nonnegative().optional(),
            adoptionRate: z.number().min(0).max(1).optional(),
          })
          .optional(),
      })
      .optional()
      .parse(raw.presetOverrides);
    return {
      low: scenarioPresets("LOW", base, presetOverrides),
      medium: scenarioPresets("MEDIUM", base, presetOverrides),
      high: scenarioPresets("HIGH", base, presetOverrides),
      custom: calculateRevenue(base),
    };
  });
};
