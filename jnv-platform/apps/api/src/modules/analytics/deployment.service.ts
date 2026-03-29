import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../shared/prisma.js";

export type DeploymentStrategyFilters = {
  state?: string;
  regionId?: string;
  minReadiness?: number;
  maxReadiness?: number;
  minMonthlyRevenue?: number;
  maxMonthlyRevenue?: number;
};

export type DeploymentPriorityBreakdown = {
  readiness: number;
  students: number;
  infra: number;
  digital: number;
};

export type DeploymentSchoolRow = {
  udise: string;
  schoolName: string;
  geographicState: string | null;
  geographicDistrict: string | null;
  regionCode: string | null;
  regionName: string | null;
  totalStudents: number | null;
  profileCompletenessPct: number | null;
  monthlyRevenue: number | null;
  pipelineStatus: string;
  parsingStatus: string;
  pilotSuitable: boolean | null;
  priorityScore: number;
  breakdown: DeploymentPriorityBreakdown;
};

export type DeploymentStateRevenueRow = {
  state: string;
  schoolCount: number;
  totalStudents: number;
  monthlyRevenueSum: number;
  avgReadiness: number | null;
};

export type DeploymentReadinessBucket = {
  label: string;
  count: number;
};

export type DeploymentNextTarget = {
  udise: string;
  schoolName: string;
  geographicState: string | null;
  priorityScore: number;
  pipelineStatus: string;
  profileCompletenessPct: number | null;
};

export type DeploymentProgress = {
  /** Schools in current filter. */
  filteredSchoolCount: number;
  /** % with parsingStatus COMPLETE. */
  parsingCompletePercent: number;
  /** % with pipelineStatus DONE. */
  pipelineDonePercent: number;
  /** Count with pilotSuitable true. */
  pilotSchoolsCount: number;
  /** High-priority schools not yet DONE (deployment queue). */
  nextTargets: DeploymentNextTarget[];
};

export type DeploymentStrategyResponse = {
  filters: DeploymentStrategyFilters;
  progress: DeploymentProgress;
  priorityWeights: { readiness: number; students: number; infra: number; digital: number };
  topSchools: DeploymentSchoolRow[];
  stateRevenueSummary: DeploymentStateRevenueRow[];
  readinessDistribution: DeploymentReadinessBucket[];
};

const WEIGHTS = { readiness: 0.3, students: 0.25, infra: 0.25, digital: 0.2 } as const;
const INFRA_COUNT = 6;

type SchoolForDeployment = {
  udise: string;
  schoolName: string;
  geographicState: string | null;
  geographicDistrict: string | null;
  totalStudents: number | null;
  profileCompletenessPct: number | null;
  pilotSuitable: boolean | null;
  pipelineStatus: string;
  parsingStatus: string;
  waterAvailable: boolean | null;
  electricityAvailable: boolean | null;
  internetAvailable: boolean | null;
  solarAvailable: boolean | null;
  playgroundAvailable: boolean | null;
  libraryAvailable: boolean | null;
  digital: {
    desktops: number | null;
    laptops: number | null;
    tablets: number | null;
    smartClassTv: number | null;
  } | null;
  revenueScenarios: { monthlyRevenue: number | null }[];
  state: {
    regionId: string | null;
    region: { code: string; name: string } | null;
  } | null;
};

export function computeDeploymentPriority(s: SchoolForDeployment): {
  priorityScore: number;
  breakdown: DeploymentPriorityBreakdown;
  monthlyRevenue: number | null;
} {
  const readiness = Math.max(0, Math.min(100, s.profileCompletenessPct ?? 0));

  const head = s.totalStudents ?? 0;
  const students = Math.max(0, Math.min(100, (head / 500) * 100));

  let infraOn = 0;
  if (s.waterAvailable === true) infraOn++;
  if (s.electricityAvailable === true) infraOn++;
  if (s.internetAvailable === true) infraOn++;
  if (s.solarAvailable === true) infraOn++;
  if (s.playgroundAvailable === true) infraOn++;
  if (s.libraryAvailable === true) infraOn++;
  const infra = (infraOn / INFRA_COUNT) * 100;

  const d = s.digital;
  const deviceSum =
    (d?.desktops ?? 0) +
    (d?.laptops ?? 0) +
    (d?.tablets ?? 0) +
    (d?.smartClassTv ?? 0) * 2;
  const digital = Math.max(0, Math.min(100, (Math.log1p(deviceSum) / Math.log1p(150)) * 100));

  const priorityScore = Math.round(
    WEIGHTS.readiness * readiness +
      WEIGHTS.students * students +
      WEIGHTS.infra * infra +
      WEIGHTS.digital * digital,
  );

  const monthlyRevenue = s.revenueScenarios[0]?.monthlyRevenue ?? null;

  return {
    priorityScore,
    breakdown: {
      readiness: Math.round(readiness * 10) / 10,
      students: Math.round(students * 10) / 10,
      infra: Math.round(infra * 10) / 10,
      digital: Math.round(digital * 10) / 10,
    },
    monthlyRevenue,
  };
}

function buildWhere(f: DeploymentStrategyFilters): Prisma.SchoolWhereInput {
  const and: Prisma.SchoolWhereInput[] = [];

  if (f.state?.trim()) {
    const q = f.state.trim();
    and.push({
      OR: [{ geographicState: { contains: q } }, { apiStateName: { contains: q } }],
    });
  }
  if (f.regionId?.trim()) {
    and.push({ state: { regionId: f.regionId.trim() } });
  }
  if (f.minReadiness != null) {
    and.push({ profileCompletenessPct: { gte: f.minReadiness } });
  }
  if (f.maxReadiness != null) {
    and.push({ profileCompletenessPct: { lte: f.maxReadiness } });
  }

  return and.length ? { AND: and } : {};
}

function passesRevenueFilter(
  monthly: number | null,
  minR?: number,
  maxR?: number,
): boolean {
  const v = monthly ?? 0;
  if (minR != null && v < minR) return false;
  if (maxR != null && v > maxR) return false;
  return true;
}

const deploymentSelect = {
  udise: true,
  schoolName: true,
  geographicState: true,
  geographicDistrict: true,
  totalStudents: true,
  profileCompletenessPct: true,
  pilotSuitable: true,
  pipelineStatus: true,
  parsingStatus: true,
  waterAvailable: true,
  electricityAvailable: true,
  internetAvailable: true,
  solarAvailable: true,
  playgroundAvailable: true,
  libraryAvailable: true,
  digital: {
    select: {
      desktops: true,
      laptops: true,
      tablets: true,
      smartClassTv: true,
    },
  },
  revenueScenarios: {
    where: { kind: "CUSTOM" as const },
    orderBy: { computedAt: "desc" as const },
    take: 1,
    select: { monthlyRevenue: true },
  },
  state: {
    select: {
      regionId: true,
      region: { select: { code: true, name: true } },
    },
  },
} as const;

export async function deploymentStrategyDashboard(
  filters: DeploymentStrategyFilters,
  options: { topLimit: number },
): Promise<DeploymentStrategyResponse> {
  const prisma = getPrisma();
  const where = buildWhere(filters);

  const raw = await prisma.school.findMany({
    where,
    select: deploymentSelect,
  });

  const scored: DeploymentSchoolRow[] = [];

  for (const row of raw) {
    const { priorityScore, breakdown, monthlyRevenue } = computeDeploymentPriority(row as SchoolForDeployment);
    if (!passesRevenueFilter(monthlyRevenue, filters.minMonthlyRevenue, filters.maxMonthlyRevenue)) {
      continue;
    }
    scored.push({
      udise: row.udise,
      schoolName: row.schoolName,
      geographicState: row.geographicState,
      geographicDistrict: row.geographicDistrict,
      regionCode: row.state?.region?.code ?? null,
      regionName: row.state?.region?.name ?? null,
      totalStudents: row.totalStudents,
      profileCompletenessPct: row.profileCompletenessPct,
      monthlyRevenue,
      pipelineStatus: row.pipelineStatus,
      parsingStatus: row.parsingStatus,
      pilotSuitable: row.pilotSuitable,
      priorityScore,
      breakdown,
    });
  }

  scored.sort((a, b) => b.priorityScore - a.priorityScore || (b.totalStudents ?? 0) - (a.totalStudents ?? 0));

  const topSchools = scored.slice(0, Math.min(100, Math.max(1, options.topLimit)));

  const byState = new Map<
    string,
    { schoolCount: number; totalStudents: number; monthlyRevenueSum: number; sumReadiness: number; readinessN: number }
  >();
  const readinessBucketCounts = new Map<string, number>();
  const bumpReadiness = (label: string) =>
    readinessBucketCounts.set(label, (readinessBucketCounts.get(label) ?? 0) + 1);

  let parsingComplete = 0;
  let pipelineDone = 0;
  let pilotCount = 0;

  for (const s of scored) {
    if (s.parsingStatus === "COMPLETE") parsingComplete++;
    if (s.pipelineStatus === "DONE") pipelineDone++;
    if (s.pilotSuitable === true) pilotCount++;

    const stateName = s.geographicState?.trim() || "Unknown";
    if (!byState.has(stateName)) {
      byState.set(stateName, {
        schoolCount: 0,
        totalStudents: 0,
        monthlyRevenueSum: 0,
        sumReadiness: 0,
        readinessN: 0,
      });
    }
    const st = byState.get(stateName)!;
    st.schoolCount += 1;
    st.totalStudents += s.totalStudents ?? 0;
    st.monthlyRevenueSum += s.monthlyRevenue ?? 0;
    if (s.profileCompletenessPct != null) {
      st.sumReadiness += s.profileCompletenessPct;
      st.readinessN += 1;
    }

    const p = s.profileCompletenessPct;
    if (p == null) bumpReadiness("Unknown");
    else if (p < 50) bumpReadiness("0 – 49%");
    else if (p < 75) bumpReadiness("50 – 74%");
    else bumpReadiness("75 – 100%");
  }

  const n = scored.length;
  const stateRevenueSummary: DeploymentStateRevenueRow[] = [...byState.entries()]
    .map(([state, v]) => ({
      state,
      schoolCount: v.schoolCount,
      totalStudents: v.totalStudents,
      monthlyRevenueSum: Math.round(v.monthlyRevenueSum * 100) / 100,
      avgReadiness:
        v.readinessN > 0 ? Math.round((v.sumReadiness / v.readinessN) * 10) / 10 : null,
    }))
    .sort((a, b) => b.monthlyRevenueSum - a.monthlyRevenueSum || b.totalStudents - a.totalStudents);

  const readinessOrder = ["Unknown", "0 – 49%", "50 – 74%", "75 – 100%"];
  const readinessDistribution: DeploymentReadinessBucket[] = readinessOrder.map((label) => ({
    label,
    count: readinessBucketCounts.get(label) ?? 0,
  }));

  const nextTargets: DeploymentNextTarget[] = scored
    .filter((s) => s.pipelineStatus !== "DONE")
    .slice(0, 10)
    .map((s) => ({
      udise: s.udise,
      schoolName: s.schoolName,
      geographicState: s.geographicState,
      priorityScore: s.priorityScore,
      pipelineStatus: s.pipelineStatus,
      profileCompletenessPct: s.profileCompletenessPct,
    }));

  return {
    filters,
    priorityWeights: { ...WEIGHTS },
    progress: {
      filteredSchoolCount: n,
      parsingCompletePercent: n > 0 ? Math.round((parsingComplete / n) * 100) : 0,
      pipelineDonePercent: n > 0 ? Math.round((pipelineDone / n) * 100) : 0,
      pilotSchoolsCount: pilotCount,
      nextTargets,
    },
    topSchools,
    stateRevenueSummary,
    readinessDistribution,
  };
}
