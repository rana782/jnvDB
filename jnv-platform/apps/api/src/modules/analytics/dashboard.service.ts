import { getPrisma } from "../../shared/prisma.js";
import { inferNvsRegionFromDisplayState } from "../../data/nvs-states-regions.js";
import { effectiveHeadcountFromRow } from "../../shared/effective-school-headcount.js";
import { effectiveDisplayState } from "../map/map-aggregate-core.js";
import { calculateRevenue } from "./revenue-calculator.js";

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

export type DashboardStateRegionMapRow = {
  state: string;
  regionCode: string;
  regionName: string;
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

const DEFAULT_MODEL = {
  pricePerWash: 30,
  adoptionRate: 0.85,
  washesPerStudentPerMonth: 4,
} as const;

function portfolioRevenueForSchool(
  storedMonthly: number | null | undefined,
  storedAnnual: number | null | undefined,
  head: { total: number; boys: number; girls: number },
): { monthly: number; annual: number } {
  if (storedMonthly != null && storedMonthly > 0) {
    const annual =
      storedAnnual != null && storedAnnual > 0 ? storedAnnual : storedMonthly * 9;
    return { monthly: storedMonthly, annual };
  }
  if (head.total <= 0) return { monthly: 0, annual: 0 };
  const r = calculateRevenue({
    totalStudents: head.total,
    boys: head.boys,
    girls: head.girls,
    ...DEFAULT_MODEL,
  });
  return { monthly: r.monthlyRevenue, annual: r.annualRevenue };
}

function monthlyForCharts(
  storedMonthly: number | null | undefined,
  head: { total: number; boys: number; girls: number },
): number {
  return portfolioRevenueForSchool(storedMonthly, undefined, head).monthly;
}

const schoolSelectForDashboard = {
  geographicState: true,
  apiStateName: true,
  stateId: true,
  totalStudents: true,
  totalBoys: true,
  totalGirls: true,
  profileCompletenessPct: true,
  state: { select: { region: { select: { code: true, name: true } } } },
  enrolmentSocial: {
    where: { category: "Total" },
    take: 1,
    select: { total: true, boys: true, girls: true },
  },
  revenueScenarios: {
    where: { kind: "CUSTOM" as const },
    orderBy: { computedAt: "desc" as const },
    take: 1,
    select: { monthlyRevenue: true, annualRevenue: true },
  },
} as const;

/** Row shape from `schoolSelectForDashboard` (map + revenue + headcount). */
type SchoolRow = {
  geographicState: string | null;
  apiStateName: string | null;
  stateId: string | null;
  totalStudents: number | null;
  totalBoys: number | null;
  totalGirls: number | null;
  profileCompletenessPct: number | null;
  state: { region: { code: string; name: string } | null } | null;
  enrolmentSocial: { total: number | null; boys: number | null; girls: number | null }[];
  revenueScenarios: { monthlyRevenue: number | null; annualRevenue: number | null }[];
};

export type DashboardSummaryPayload = {
  totalSchools: number;
  totalStudents: number;
  totalBoys: number;
  totalGirls: number;
  schoolsCompleted: number;
  portfolioMonthlyRevenue: number;
  portfolioAnnualRevenue: number;
  schoolsWithStudentHeadcount: number;
  schoolsLinkedToNvsRegion: number;
};

function computeSummaryFromRows(
  rows: SchoolRow[],
  totalSchools: number,
  pipelineDone: number,
): DashboardSummaryPayload {
  let totalStudents = 0;
  let totalBoys = 0;
  let totalGirls = 0;
  let portfolioMonthlyRevenue = 0;
  let portfolioAnnualRevenue = 0;
  let schoolsWithStudentHeadcount = 0;
  let schoolsLinkedToNvsRegion = 0;

  for (const s of rows) {
    const head = effectiveHeadcountFromRow(s);
    totalStudents += head.total;
    totalBoys += head.boys;
    totalGirls += head.girls;
    if (head.total > 0) schoolsWithStudentHeadcount += 1;

    const display = effectiveDisplayState(s);
    if (s.stateId != null || inferNvsRegionFromDisplayState(display) != null) {
      schoolsLinkedToNvsRegion += 1;
    }

    const storedM = s.revenueScenarios[0]?.monthlyRevenue;
    const storedA = s.revenueScenarios[0]?.annualRevenue;
    const pr = portfolioRevenueForSchool(storedM, storedA, head);
    portfolioMonthlyRevenue += pr.monthly;
    portfolioAnnualRevenue += pr.annual;
  }

  return {
    totalSchools,
    totalStudents,
    totalBoys,
    totalGirls,
    schoolsCompleted: pipelineDone,
    portfolioMonthlyRevenue: round2(portfolioMonthlyRevenue),
    portfolioAnnualRevenue: round2(portfolioAnnualRevenue),
    schoolsWithStudentHeadcount,
    schoolsLinkedToNvsRegion,
  };
}

export async function dashboardSummary() {
  const prisma = getPrisma();
  const [totalSchools, pipelineDone, rows] = await Promise.all([
    prisma.school.count(),
    prisma.school.count({ where: { pipelineStatus: "DONE" } }),
    prisma.school.findMany({ select: schoolSelectForDashboard }),
  ]);
  return computeSummaryFromRows(rows as SchoolRow[], totalSchools, pipelineDone);
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
 * Opportunity = effective enrolled students in state (primary) with model monthly revenue sum as context.
 */
export async function dashboardOverview() {
  const prisma = getPrisma();
  const [totalSchools, pipelineDone, schools] = await Promise.all([
    prisma.school.count(),
    prisma.school.count({ where: { pipelineStatus: "DONE" } }),
    prisma.school.findMany({ select: schoolSelectForDashboard }),
  ]);
  const summary = computeSummaryFromRows(schools as SchoolRow[], totalSchools, pipelineDone);

  type StateAgg = { schoolCount: number; students: number; monthlyRevenueSum: number };
  const byState = new Map<string, StateAgg>();
  type RegionAgg = {
    regionName: string;
    schoolCount: number;
    sumReadiness: number;
    readinessN: number;
  };
  const byRegion = new Map<string, RegionAgg>();
  const stateRegionMap = new Map<string, { regionCode: string; regionName: string }>();

  const revenueBucketCounts = new Map<string, number>();
  const bumpBucket = (label: string) => revenueBucketCounts.set(label, (revenueBucketCounts.get(label) ?? 0) + 1);

  const readinessBucketCounts = new Map<string, number>();
  const bumpReadiness = (label: string) =>
    readinessBucketCounts.set(label, (readinessBucketCounts.get(label) ?? 0) + 1);

  for (const s of schools as SchoolRow[]) {
    const stateName = effectiveDisplayState(s);
    if (!byState.has(stateName)) {
      byState.set(stateName, { schoolCount: 0, students: 0, monthlyRevenueSum: 0 });
    }
    const st = byState.get(stateName)!;
    st.schoolCount += 1;
    const head = effectiveHeadcountFromRow(s);
    st.students += head.total;
    const storedM = s.revenueScenarios[0]?.monthlyRevenue;
    const monthly = monthlyForCharts(storedM, head);
    st.monthlyRevenueSum += monthly;

    const inferred = inferNvsRegionFromDisplayState(stateName);
    const regCode = s.state?.region?.code ?? inferred?.regionCode ?? "UNMAPPED";
    const regName = s.state?.region?.name ?? inferred?.regionName ?? "Unmapped region";
    const prev = stateRegionMap.get(stateName);
    if (!prev || prev.regionCode === "UNMAPPED") {
      stateRegionMap.set(stateName, { regionCode: regCode, regionName: regName });
    }
    if (!byRegion.has(regCode)) {
      byRegion.set(regCode, { regionName: regName, schoolCount: 0, sumReadiness: 0, readinessN: 0 });
    }
    const rg = byRegion.get(regCode)!;
    rg.schoolCount += 1;
    if (s.profileCompletenessPct != null) {
      rg.sumReadiness += s.profileCompletenessPct;
      rg.readinessN += 1;
    }

    if (monthly <= 0) bumpBucket("No / zero model");
    else if (monthly <= 15_000) bumpBucket("₹1 – 15k / mo");
    else if (monthly <= 40_000) bumpBucket("₹15 – 40k / mo");
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

  const stateRegionPairs: DashboardStateRegionMapRow[] = [...stateRegionMap.entries()]
    .map(([state, v]) => ({
      state,
      regionCode: v.regionCode,
      regionName: v.regionName,
    }))
    .sort((a, b) => a.state.localeCompare(b.state));

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
    stateRegionMap: stateRegionPairs,
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
