import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { dashboardProgress, dashboardSummary } from "./dashboard.service.js";
import { scenarioPresets, calculateRevenue, revenueInputSchema } from "./revenue-calculator.js";
import { getPrisma } from "../../shared/prisma.js";
import { postRevenueCalculate } from "../schools/schools.service.js";

export const registerAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/summary", async () => dashboardSummary());

  app.get("/dashboard/progress", async () => dashboardProgress());

  app.post("/revenue/calculate", async (request) => {
    const body = z
      .object({
        udise: z.string(),
        occupancyRate: z.number().optional(),
        pricePerWash: z.number().optional(),
        washesPerStudentPerMonth: z.number().optional(),
      })
      .parse(request.body);
    return postRevenueCalculate(body);
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
    const base = revenueInputSchema.parse(request.body);
    return {
      low: scenarioPresets("LOW", base),
      medium: scenarioPresets("MEDIUM", base),
      high: scenarioPresets("HIGH", base),
      custom: calculateRevenue(base),
    };
  });
};
