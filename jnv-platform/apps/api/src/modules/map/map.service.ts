import { Prisma } from "@prisma/client";
import { getPrisma } from "../../shared/prisma.js";
import { aggregateSchools } from "./map-aggregate-core.js";
import {
  ensureMapRollupsPopulated,
  isMapRollupEligible,
  readMapDistrictsFromRollup,
  readMapStateFromRollup,
} from "./map-rollup.service.js";

export type MapColorBy = "jnv_count" | "readiness";

export type MapAggregateFilters = {
  water?: boolean;
  electricity?: boolean;
  internet?: boolean;
  pipelineStatus?: string;
  /** Schools with profile completeness ≥ threshold (default 75). */
  highReadiness?: boolean;
  minReadinessPct?: number;
  /** Schools with totalStudents ≥ threshold (default 350). */
  highStudentCount?: boolean;
  minStudentHeadcount?: number;
  /** Only `parsingStatus === COMPLETE`. */
  completedOnly?: boolean;
};

const DEFAULT_MIN_READINESS = 75;
const DEFAULT_MIN_STUDENTS_FOR_HIGH = 350;

export function buildSchoolWhere(f: MapAggregateFilters): Prisma.SchoolWhereInput {
  const and: Prisma.SchoolWhereInput[] = [];

  if (f.water !== undefined) and.push({ waterAvailable: f.water });
  if (f.electricity !== undefined) and.push({ electricityAvailable: f.electricity });
  if (f.internet !== undefined) and.push({ internetAvailable: f.internet });
  if (f.pipelineStatus) and.push({ pipelineStatus: f.pipelineStatus as never });

  if (f.highReadiness) {
    const min = f.minReadinessPct ?? DEFAULT_MIN_READINESS;
    and.push({ profileCompletenessPct: { gte: min } });
  }

  if (f.highStudentCount) {
    const minSt = f.minStudentHeadcount ?? DEFAULT_MIN_STUDENTS_FOR_HIGH;
    and.push({ totalStudents: { gte: minSt } });
  }

  if (f.completedOnly) {
    and.push({ parsingStatus: "COMPLETE" });
  }

  return and.length ? { AND: and } : {};
}

function isMissingRollupTable(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021";
}

const schoolMapSelect = {
  udise: true,
  geographicState: true,
  geographicDistrict: true,
  totalStudents: true,
  profileCompletenessPct: true,
  parsingStatus: true,
  state: { select: { regionId: true, region: { select: { id: true, name: true, code: true } } } },
} as const;

function stripRollupFields<T extends { readinessSum?: number; readinessN?: number }>(states: T[]) {
  return states.map(({ readinessSum: _rs, readinessN: _rn, ...rest }) => rest);
}

export async function mapStateAggregates(filters: MapAggregateFilters, colorBy: MapColorBy) {
  if (isMapRollupEligible(filters)) {
    try {
      await ensureMapRollupsPopulated();
      const rolled = await readMapStateFromRollup(colorBy);
      return {
        ...rolled,
        meta: {
          ...rolled.meta,
          minReadinessApplied: null,
          minStudentsApplied: null,
        },
      };
    } catch (e) {
      if (!isMissingRollupTable(e)) throw e;
    }
  }

  const prisma = getPrisma();
  const where = buildSchoolWhere(filters);

  const schools = await prisma.school.findMany({
    where,
    select: schoolMapSelect,
  });

  const { states: rawStates, regions, totalSchools, maxStateSchoolCount, maxStateAvgReadiness } =
    aggregateSchools(schools);

  const states = stripRollupFields(rawStates);

  return {
    meta: {
      totalSchools,
      maxStateSchoolCount,
      maxStateAvgReadiness,
      colorBy,
      minReadinessApplied: filters.highReadiness ? (filters.minReadinessPct ?? DEFAULT_MIN_READINESS) : null,
      minStudentsApplied: filters.highStudentCount
        ? (filters.minStudentHeadcount ?? DEFAULT_MIN_STUDENTS_FOR_HIGH)
        : null,
    },
    states,
    regions,
  };
}

export async function mapDistrictAggregates(stateName: string, filters: MapAggregateFilters) {
  if (isMapRollupEligible(filters)) {
    try {
      await ensureMapRollupsPopulated();
      return await readMapDistrictsFromRollup(stateName);
    } catch (e) {
      if (!isMissingRollupTable(e)) throw e;
    }
  }

  const prisma = getPrisma();
  const baseWhere = buildSchoolWhere(filters);
  const stateFilter: Prisma.SchoolWhereInput = { geographicState: stateName };
  const where: Prisma.SchoolWhereInput =
    Object.keys(baseWhere).length > 0 ? { AND: [baseWhere, stateFilter] } : stateFilter;

  const schools = await prisma.school.findMany({
    where,
    select: {
      geographicDistrict: true,
      totalStudents: true,
      profileCompletenessPct: true,
      parsingStatus: true,
    },
  });

  const byDistrict = new Map<
    string,
    { count: number; students: number; readinessSum: number; readinessN: number; completed: number }
  >();

  for (const s of schools) {
    const d = s.geographicDistrict?.trim() || "Unknown";
    if (!byDistrict.has(d)) {
      byDistrict.set(d, { count: 0, students: 0, readinessSum: 0, readinessN: 0, completed: 0 });
    }
    const agg = byDistrict.get(d)!;
    agg.count++;
    agg.students += s.totalStudents ?? 0;
    if (s.profileCompletenessPct != null) {
      agg.readinessSum += s.profileCompletenessPct;
      agg.readinessN++;
    }
    if (s.parsingStatus === "COMPLETE") agg.completed++;
  }

  const districts = [...byDistrict.entries()]
    .map(([name, v]) => ({
      name,
      schoolCount: v.count,
      studentSum: v.students,
      avgReadiness: v.readinessN > 0 ? Math.round((v.readinessSum / v.readinessN) * 10) / 10 : null,
      completedCount: v.completed,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const maxDistrictSchoolCount = districts.reduce((m, d) => Math.max(m, d.schoolCount), 0);
  const maxDistrictAvgReadiness = districts.reduce((m, d) => {
    if (d.avgReadiness == null) return m;
    return Math.max(m, d.avgReadiness);
  }, 0);

  return {
    state: stateName,
    meta: {
      totalSchools: schools.length,
      maxDistrictSchoolCount,
      maxDistrictAvgReadiness: maxDistrictAvgReadiness || 100,
    },
    districts,
  };
}
