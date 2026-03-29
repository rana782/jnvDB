import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("buildApp", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  afterAll(async () => {
    await app?.close();
  });

  it("serves health (SQLite default when DATABASE_URL unset)", async () => {
    app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("serves dashboard overview JSON", async () => {
    const a = await buildApp();
    try {
      const res = await a.inject({ method: "GET", url: "/api/dashboard/overview" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        totalSchools: number;
        charts: { stateDistribution: unknown[] };
        topStatesByOpportunity: unknown[];
      };
      expect(typeof body.totalSchools).toBe("number");
      expect(Array.isArray(body.charts.stateDistribution)).toBe(true);
      expect(Array.isArray(body.topStatesByOpportunity)).toBe(true);
    } finally {
      await a.close();
    }
  });

  it("serves dashboard progress JSON", async () => {
    const a = await buildApp();
    try {
      const res = await a.inject({ method: "GET", url: "/api/dashboard/progress" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        totalSchools: number;
        pipeline: object;
        completedPercent: number;
        completedRevenueMonthly: number;
      };
      expect(typeof body.totalSchools).toBe("number");
      expect(body.pipeline).toBeDefined();
      expect(typeof body.completedPercent).toBe("number");
      expect(typeof body.completedRevenueMonthly).toBe("number");
    } finally {
      await a.close();
    }
  });

  it("serves deployment strategy JSON", async () => {
    const a = await buildApp();
    try {
      const res = await a.inject({ method: "GET", url: "/api/dashboard/deployment?topLimit=20" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        topSchools: { udise: string; priorityScore: number }[];
        stateRevenueSummary: unknown[];
        readinessDistribution: { label: string; count: number }[];
        progress: { filteredSchoolCount: number; nextTargets: unknown[] };
      };
      expect(Array.isArray(body.topSchools)).toBe(true);
      expect(Array.isArray(body.stateRevenueSummary)).toBe(true);
      expect(body.readinessDistribution.length).toBeGreaterThan(0);
      expect(typeof body.progress.filteredSchoolCount).toBe("number");
    } finally {
      await a.close();
    }
  });
});
