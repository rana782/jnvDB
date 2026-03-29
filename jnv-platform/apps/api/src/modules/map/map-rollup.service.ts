import { getPrisma } from "../../shared/prisma.js";
import { invalidateMapAndDashboardCache } from "../../shared/response-cache.js";
import { aggregateSchools } from "./map-aggregate-core.js";
import type { MapAggregateFilters, MapColorBy } from "./map.service.js";

const schoolSelectRollup = {
  udise: true,
  geographicState: true,
  geographicDistrict: true,
  totalStudents: true,
  profileCompletenessPct: true,
  parsingStatus: true,
  state: { select: { regionId: true, region: { select: { id: true, name: true, code: true } } } },
} as const;

/** True when no dynamic filters — rollups match full portfolio. */
export function isMapRollupEligible(filters: MapAggregateFilters): boolean {
  return (
    filters.water === undefined &&
    filters.electricity === undefined &&
    filters.internet === undefined &&
    !filters.pipelineStatus &&
    !filters.highReadiness &&
    !filters.highStudentCount &&
    !filters.completedOnly
  );
}

function roundReadiness(sum: number, n: number): number | null {
  if (n <= 0) return null;
  return Math.round((sum / n) * 10) / 10;
}

/** Rebuild `MapStateAggregate` and `MapDistrictAggregate` from `School` (single scan). */
export async function refreshMapAggregates(): Promise<void> {
  const prisma = getPrisma();
  const schools = await prisma.school.findMany({ select: schoolSelectRollup });

  const { states } = aggregateSchools(schools);

  const stateToRegion = new Map<string, string>();
  for (const s of schools) {
    const st = s.geographicState || "Unknown";
    if (!stateToRegion.has(st)) {
      stateToRegion.set(st, s.state?.region?.name ?? "Unassigned");
    }
  }

  const byDistrict = new Map<
    string,
    { state: string; district: string; count: number; students: number; rs: number; rn: number; completed: number }
  >();
  for (const s of schools) {
    const st = s.geographicState || "Unknown";
    const d = s.geographicDistrict?.trim() || "Unknown";
    const key = `${st}\0${d}`;
    if (!byDistrict.has(key)) {
      byDistrict.set(key, { state: st, district: d, count: 0, students: 0, rs: 0, rn: 0, completed: 0 });
    }
    const agg = byDistrict.get(key)!;
    agg.count++;
    agg.students += s.totalStudents ?? 0;
    if (s.profileCompletenessPct != null) {
      agg.rs += s.profileCompletenessPct;
      agg.rn++;
    }
    if (s.parsingStatus === "COMPLETE") agg.completed++;
  }

  const stateRows = states.map((row) => ({
    stateName: row.name,
    schoolCount: row.schoolCount,
    studentSum: row.studentSum,
    districtCount: row.districtCount,
    readinessSum: row.readinessSum,
    readinessN: row.readinessN,
    completedCount: row.completedCount,
    regionName: stateToRegion.get(row.name) ?? "Unassigned",
  }));

  const districtRows = [...byDistrict.values()].map((v) => ({
    stateName: v.state,
    districtName: v.district,
    schoolCount: v.count,
    studentSum: v.students,
    readinessSum: v.rs,
    readinessN: v.rn,
    completedCount: v.completed,
  }));

  await prisma.$transaction([
    prisma.mapStateAggregate.deleteMany(),
    prisma.mapDistrictAggregate.deleteMany(),
    prisma.mapStateAggregate.createMany({ data: stateRows }),
    prisma.mapDistrictAggregate.createMany({ data: districtRows }),
  ]);

  invalidateMapAndDashboardCache();
}

export async function ensureMapRollupsPopulated(): Promise<void> {
  const prisma = getPrisma();
  const n = await prisma.mapStateAggregate.count();
  if (n === 0) {
    await refreshMapAggregates();
  }
}

export async function readMapStateFromRollup(colorBy: MapColorBy) {
  const prisma = getPrisma();
  const rows = await prisma.mapStateAggregate.findMany({ orderBy: { stateName: "asc" } });
  const states = rows.map((r) => ({
    name: r.stateName,
    schoolCount: r.schoolCount,
    studentSum: r.studentSum,
    districtCount: r.districtCount,
    avgReadiness: roundReadiness(r.readinessSum, r.readinessN),
    completedCount: r.completedCount,
  }));

  const byRegion = new Map<string, { count: number; students: number; rs: number; rn: number }>();
  for (const r of rows) {
    const rn = r.regionName || "Unassigned";
    if (!byRegion.has(rn)) byRegion.set(rn, { count: 0, students: 0, rs: 0, rn: 0 });
    const g = byRegion.get(rn)!;
    g.count += r.schoolCount;
    g.students += r.studentSum;
    g.rs += r.readinessSum;
    g.rn += r.readinessN;
  }

  const regions = [...byRegion.entries()].map(([name, v]) => ({
    name,
    schoolCount: v.count,
    studentSum: v.students,
    avgReadiness: roundReadiness(v.rs, v.rn),
  }));

  const totalSchools = rows.reduce((a, r) => a + r.schoolCount, 0);
  const maxStateSchoolCount = states.reduce((m, s) => Math.max(m, s.schoolCount), 0);
  const maxStateAvgReadiness = states.reduce((m, s) => {
    if (s.avgReadiness == null) return m;
    return Math.max(m, s.avgReadiness);
  }, 0);

  return {
    meta: {
      totalSchools,
      maxStateSchoolCount,
      maxStateAvgReadiness: maxStateAvgReadiness || 100,
      colorBy,
      minReadinessApplied: null as number | null,
      minStudentsApplied: null as number | null,
    },
    states,
    regions,
  };
}

export async function readMapDistrictsFromRollup(stateName: string) {
  const prisma = getPrisma();
  const rows = await prisma.mapDistrictAggregate.findMany({
    where: { stateName },
    orderBy: { districtName: "asc" },
  });
  const districts = rows.map((r) => ({
    name: r.districtName,
    schoolCount: r.schoolCount,
    studentSum: r.studentSum,
    avgReadiness: roundReadiness(r.readinessSum, r.readinessN),
    completedCount: r.completedCount,
  }));
  const totalSchools = rows.reduce((a, r) => a + r.schoolCount, 0);
  const maxDistrictSchoolCount = districts.reduce((m, d) => Math.max(m, d.schoolCount), 0);
  const maxDistrictAvgReadiness = districts.reduce((m, d) => {
    if (d.avgReadiness == null) return m;
    return Math.max(m, d.avgReadiness);
  }, 0);
  return {
    state: stateName,
    meta: {
      totalSchools,
      maxDistrictSchoolCount,
      maxDistrictAvgReadiness: maxDistrictAvgReadiness || 100,
    },
    districts,
  };
}
