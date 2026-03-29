import { getPrisma } from "../../shared/prisma.js";

export type DashboardStateOpportunity = {
  state: string;
  schoolCount: number;
  totalStudents: number;
  monthlyRevenueSum: number;
};

export type DashboardRegionReadiness = {
  regionCode: string;
  regionName: string;
  schoolCount: number;
  avgReadiness: number | null;
};

export type DashboardChartStateRow = {
  name: string;
  schools: number;
  students: number;
};

export type DashboardChartBucket = {
  label: string;
  count: number;
};

export async function dashboardSummary() {
  const prisma = getPrisma();
  const [
    totalSchools,
    studentsAgg,
    pipelineDone,
    revenueAgg,
  ] = await Promise.all([
    prisma.school.count(),
    prisma.school.aggregate({
      _sum: { totalStudents: true, totalBoys: true, totalGirls: true },
    }),
    prisma.school.count({ where: { pipelineStatus: "DONE" } }),
    prisma.schoolRevenueScenario.aggregate({
      where: { kind: "CUSTOM" },
      _sum: { monthlyRevenue: true, annualRevenue: true },
    }),
  ]);

  return {
    totalSchools,
    totalStudents: studentsAgg._sum.totalStudents ?? 0,
    totalBoys: studentsAgg._sum.totalBoys ?? 0,
    totalGirls: studentsAgg._sum.totalGirls ?? 0,
    schoolsCompleted: pipelineDone,
    portfolioMonthlyRevenue: revenueAgg._sum.monthlyRevenue ?? 0,
    portfolioAnnualRevenue: revenueAgg._sum.annualRevenue ?? 0,
  };
}

export async function dashboardProgress() {
  const prisma = getPrisma();
  const [totalSchools, pipelineGroups, parsingGroups, completedRevenueAgg] = await Promise.all([
    prisma.school.count(),
    prisma.school.groupBy({
      by: ["pipelineStatus"],
      _count: { _all: true },
    }),
    prisma.school.groupBy({
      by: ["parsingStatus"],
      _count: { _all: true },
    }),
    prisma.schoolRevenueScenario.aggregate({
      where: {
        kind: "CUSTOM",
        school: { pipelineStatus: "DONE" },
      },
      _sum: { monthlyRevenue: true, annualRevenue: true },
    }),
  ]);

  const pipeline: Record<string, number> = {};
  for (const row of pipelineGroups) {
    pipeline[row.pipelineStatus] = row._count._all;
  }
  const parsing: Record<string, number> = {};
  for (const row of parsingGroups) {
    parsing[row.parsingStatus] = row._count._all;
  }

  const donePipeline = pipeline["DONE"] ?? 0;
  const completedPercent = totalSchools > 0 ? Math.round((donePipeline / totalSchools) * 100) : 0;

  return {
    totalSchools,
    pipeline,
    parsing,
    schoolsPipelineDone: donePipeline,
    pipelineDonePercent: completedPercent,
    completedPercent,
    completedRevenueMonthly: completedRevenueAgg._sum.monthlyRevenue ?? 0,
    completedRevenueAnnual: completedRevenueAgg._sum.annualRevenue ?? 0,
  };
}

/**
 * Full dashboard: summary KPIs plus rankings and chart series (single round-trip).
 * Opportunity = total enrolled students in state (primary) with CUSTOM monthly revenue sum as context.
 */
export async function dashboardOverview() {
  const prisma = getPrisma();
  const summary = await dashboardSummary();

  const schools = await prisma.school.findMany({
    select: {
      geographicState: true,
      totalStudents: true,
      profileCompletenessPct: true,
      state: { select: { region: { select: { code: true, name: true } } } },
      revenueScenarios: {
        where: { kind: "CUSTOM" },
        orderBy: { computedAt: "desc" },
        take: 1,
        select: { monthlyRevenue: true },
      },
    },
  });

  type StateAgg = { schoolCount: number; students: number; monthlyRevenueSum: number };
  const byState = new Map<string, StateAgg>();
  type RegionAgg = {
    regionName: string;
    schoolCount: number;
    sumReadiness: number;
    readinessN: number;
  };
  const byRegion = new Map<string, RegionAgg>();

  const revenueBucketCounts = new Map<string, number>();
  const bumpBucket = (label: string) => revenueBucketCounts.set(label, (revenueBucketCounts.get(label) ?? 0) + 1);

  const readinessBucketCounts = new Map<string, number>();
  const bumpReadiness = (label: string) =>
    readinessBucketCounts.set(label, (readinessBucketCounts.get(label) ?? 0) + 1);

  for (const s of schools) {
    const stateName = s.geographicState?.trim() || "Unknown";
    if (!byState.has(stateName)) {
      byState.set(stateName, { schoolCount: 0, students: 0, monthlyRevenueSum: 0 });
    }
    const st = byState.get(stateName)!;
    st.schoolCount += 1;
    st.students += s.totalStudents ?? 0;
    const monthly = s.revenueScenarios[0]?.monthlyRevenue ?? 0;
    st.monthlyRevenueSum += monthly;

    const regCode = s.state?.region?.code ?? "UNMAPPED";
    const regName = s.state?.region?.name ?? "Unmapped region";
    if (!byRegion.has(regCode)) {
      byRegion.set(regCode, { regionName: regName, schoolCount: 0, sumReadiness: 0, readinessN: 0 });
    }
    const rg = byRegion.get(regCode)!;
    rg.schoolCount += 1;
    if (s.profileCompletenessPct != null) {
      rg.sumReadiness += s.profileCompletenessPct;
      rg.readinessN += 1;
    }

    const rev = s.revenueScenarios[0]?.monthlyRevenue;
    if (rev == null || rev <= 0) bumpBucket("No / zero model");
    else if (rev <= 15_000) bumpBucket("₹1 – 15k / mo");
    else if (rev <= 40_000) bumpBucket("₹15 – 40k / mo");
    else bumpBucket("₹40k+ / mo");

    const p = s.profileCompletenessPct;
    if (p == null) bumpReadiness("Unknown");
    else if (p < 50) bumpReadiness("0 – 49%");
    else if (p < 75) bumpReadiness("50 – 74%");
    else bumpReadiness("75 – 100%");
  }

  const topStatesByOpportunity: DashboardStateOpportunity[] = [...byState.entries()]
    .map(([state, v]) => ({
      state,
      schoolCount: v.schoolCount,
      totalStudents: v.students,
      monthlyRevenueSum: round2(v.monthlyRevenueSum),
    }))
    .sort((a, b) => {
      if (b.totalStudents !== a.totalStudents) return b.totalStudents - a.totalStudents;
      return b.monthlyRevenueSum - a.monthlyRevenueSum;
    })
    .slice(0, 8);

  const topRegionsByReadiness: DashboardRegionReadiness[] = [...byRegion.entries()]
    .map(([regionCode, v]) => ({
      regionCode,
      regionName: v.regionName,
      schoolCount: v.schoolCount,
      avgReadiness:
        v.readinessN > 0 ? Math.round((v.sumReadiness / v.readinessN) * 10) / 10 : null,
    }))
    .sort((a, b) => {
      const ar = a.avgReadiness ?? -1;
      const br = b.avgReadiness ?? -1;
      if (br !== ar) return br - ar;
      return b.schoolCount - a.schoolCount;
    })
    .slice(0, 8);

  const stateSorted = [...byState.entries()].sort((a, b) => b[1].schoolCount - a[1].schoolCount);
  const topN = 12;
  const chartTop = stateSorted.slice(0, topN);
  const rest = stateSorted.slice(topN);
  const chartStateDistribution: DashboardChartStateRow[] = chartTop.map(([name, v]) => ({
    name: name.length > 18 ? `${name.slice(0, 16)}…` : name,
    schools: v.schoolCount,
    students: v.students,
  }));
  if (rest.length > 0) {
    const oSchools = rest.reduce((a, [, v]) => a + v.schoolCount, 0);
    const oStudents = rest.reduce((a, [, v]) => a + v.students, 0);
    chartStateDistribution.push({ name: `Other (${rest.length})`, schools: oSchools, students: oStudents });
  }

  const revenueOrder = ["No / zero model", "₹1 – 15k / mo", "₹15 – 40k / mo", "₹40k+ / mo"];
  const chartRevenueDistribution: DashboardChartBucket[] = revenueOrder.map((label) => ({
    label,
    count: revenueBucketCounts.get(label) ?? 0,
  }));

  const readinessOrder = ["Unknown", "0 – 49%", "50 – 74%", "75 – 100%"];
  const chartReadinessDistribution: DashboardChartBucket[] = readinessOrder.map((label) => ({
    label,
    count: readinessBucketCounts.get(label) ?? 0,
  }));

  return {
    ...summary,
    topStatesByOpportunity,
    topRegionsByReadiness,
    charts: {
      stateDistribution: chartStateDistribution,
      revenueDistribution: chartRevenueDistribution,
      readinessDistribution: chartReadinessDistribution,
    },
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
