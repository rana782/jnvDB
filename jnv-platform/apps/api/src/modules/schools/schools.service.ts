import { z } from "zod";
import { getPrisma } from "../../shared/prisma.js";
import { AppError } from "../../shared/errors.js";
import { normalizeUdise } from "../../shared/udise.js";
import type { PaginationQuery } from "../../shared/pagination.js";
import { offsetLimit } from "../../shared/pagination.js";
import { calculateRevenue } from "../analytics/revenue-calculator.js";
import type { Prisma } from "@prisma/client";
import {
  compareRowAsDetailRowForCanonical,
  schoolCompareInclude,
  schoolDetailInclude,
  schoolListInclude,
  toSchoolCanonical,
  toSchoolDetailApiResponse,
  toSchoolListItem,
  type SchoolCanonicalDto,
  type SchoolDetailApiResponse,
  type SchoolDetailRow,
} from "./school.dto.js";
import {
  computePilotSuitable,
  computeProfileCompletenessFromSnapshot,
  type ProfileCompletenessSnapshot,
} from "../analytics/derived-metrics.js";
import {
  getUdisesMatchingDerivedFilters,
  udiseInChunksWhere,
} from "./school-list-derived-filters.js";

function disambiguateSchoolNames<T extends { schoolName: string; geographicDistrict: string | null; geographicState: string | null; udise: string }>(
  items: T[],
): T[] {
  const byKey = new Map<string, T[]>();
  for (const it of items) {
    const k = it.schoolName.trim().toLowerCase();
    const arr = byKey.get(k) ?? [];
    arr.push(it);
    byKey.set(k, arr);
  }
  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    const seen = new Set<string>();
    for (const it of group) {
      const suffix = it.geographicDistrict?.trim() || it.geographicState?.trim() || null;
      const withSuffix = suffix ? `${it.schoolName} (${suffix})` : it.schoolName;
      const candidate = seen.has(withSuffix.toLowerCase()) ? `${withSuffix} [${it.udise}]` : withSuffix;
      it.schoolName = candidate;
      seen.add(candidate.toLowerCase());
    }
  }
  return items;
}

function rowToCompletenessSnapshot(row: SchoolDetailRow): ProfileCompletenessSnapshot {
  return {
    totalStudents: row.totalStudents,
    totalBoys: row.totalBoys,
    totalGirls: row.totalGirls,
    waterAvailable: row.waterAvailable,
    electricityAvailable: row.electricityAvailable,
    internetAvailable: row.internetAvailable,
    solarAvailable: row.solarAvailable,
    playgroundAvailable: row.playgroundAvailable,
    libraryAvailable: row.libraryAvailable,
    enrolmentSocial: row.enrolmentSocial.map((r) => ({
      total: r.total,
      boys: r.boys,
      girls: r.girls,
    })),
    enrolmentMinority: row.enrolmentMinority.map((r) => ({
      total: r.total,
      boys: r.boys,
      girls: r.girls,
    })),
    enrolmentOthers: row.enrolmentOthers.map((r) => ({
      total: r.total,
      boys: r.boys,
      girls: r.girls,
    })),
    enrolmentAge: row.enrolmentAge.map((r) => ({
      total: r.total,
      boys: r.boys,
      girls: r.girls,
    })),
    infra: row.infra,
    digital: row.digital,
  };
}

async function persistCompletenessIfChanged(row: SchoolDetailRow): Promise<SchoolDetailRow> {
  const prisma = getPrisma();
  const computed = computeProfileCompletenessFromSnapshot(rowToCompletenessSnapshot(row));
  const stored = row.profileCompletenessPct ?? 0;
  if (Math.round(computed) === Math.round(stored)) return row;
  const pilot = computePilotSuitable(row, computed);
  await prisma.school.update({
    where: { udise: row.udise },
    data: { profileCompletenessPct: computed, pilotSuitable: pilot },
  });
  return { ...row, profileCompletenessPct: computed, pilotSuitable: pilot };
}

/** Recompute profile completeness + pilot flag from current relations (after bulk KPI backfill). */
export async function recomputeSchoolDerivations(udiseRaw: string): Promise<void> {
  const prisma = getPrisma();
  const udise = normalizeUdise(udiseRaw);
  const row = await prisma.school.findUnique({ where: { udise }, include: schoolDetailInclude });
  if (!row) return;
  const computed = computeProfileCompletenessFromSnapshot(rowToCompletenessSnapshot(row));
  const pilot = computePilotSuitable(row, computed);
  await prisma.school.update({
    where: { udise },
    data: { profileCompletenessPct: computed, pilotSuitable: pilot },
  });
}

/** Treat empty query-string values as omitted (avoids NaN from z.coerce). */
function qNum(min?: number, max?: number) {
  let inner = z.coerce.number();
  if (min != null) inner = inner.min(min);
  if (max != null) inner = inner.max(max);
  return z.preprocess((v) => {
    if (v === "" || v == null) return undefined;
    if (typeof v === "string" && v.trim() === "") return undefined;
    return v;
  }, inner.optional());
}

export const schoolFilterSchema = z.object({
  state: z.string().optional(),
  district: z.string().optional(),
  regionId: z.string().optional(),
  minStudents: qNum(),
  maxStudents: qNum(),
  minBoys: qNum(),
  maxBoys: qNum(),
  minGirls: qNum(),
  maxGirls: qNum(),
  minCompleteness: qNum(0, 100),
  maxCompleteness: qNum(0, 100),
  minScRatioPct: qNum(0, 100),
  maxScRatioPct: qNum(0, 100),
  minStRatioPct: qNum(0, 100),
  maxStRatioPct: qNum(0, 100),
  minObcRatioPct: qNum(0, 100),
  maxObcRatioPct: qNum(0, 100),
  ageBand: z.preprocess(
    (v) => (v === "" || v == null ? undefined : String(v)),
    z.string().max(16).regex(/^(?:Total|\d{1,2})$/).optional(),
  ),
  minAgeSharePct: qNum(0, 100),
  maxAgeSharePct: qNum(0, 100),
  minGirlsSharePct: qNum(0, 100),
  maxGirlsSharePct: qNum(0, 100),
  water: z.enum(["yes", "no"]).optional(),
  electricity: z.enum(["yes", "no"]).optional(),
  internet: z.enum(["yes", "no"]).optional(),
  parsingStatus: z.string().optional(),
  pipelineStatus: z.string().optional(),
})
  .superRefine((f, ctx) => {
    const ageBounds = f.minAgeSharePct != null || f.maxAgeSharePct != null;
    if (ageBounds && !f.ageBand) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ageBand is required when minAgeSharePct or maxAgeSharePct is set",
        path: ["ageBand"],
      });
    }
  });

export type SchoolFilters = z.infer<typeof schoolFilterSchema>;

function boolFilter(
  v: "yes" | "no" | undefined,
): boolean | undefined {
  if (v === "yes") return true;
  if (v === "no") return false;
  return undefined;
}

export async function listSchools(pagination: PaginationQuery, filters: SchoolFilters) {
  const prisma = getPrisma();
  const { take, skip } = offsetLimit(pagination);
  const and: Prisma.SchoolWhereInput[] = [];

  const derivedUdises = await getUdisesMatchingDerivedFilters(prisma, {
    minScRatioPct: filters.minScRatioPct,
    maxScRatioPct: filters.maxScRatioPct,
    minStRatioPct: filters.minStRatioPct,
    maxStRatioPct: filters.maxStRatioPct,
    minObcRatioPct: filters.minObcRatioPct,
    maxObcRatioPct: filters.maxObcRatioPct,
    ageBand: filters.ageBand,
    minAgeSharePct: filters.minAgeSharePct,
    maxAgeSharePct: filters.maxAgeSharePct,
    minGirlsSharePct: filters.minGirlsSharePct,
    maxGirlsSharePct: filters.maxGirlsSharePct,
  });
  if (derivedUdises !== null && derivedUdises.length === 0) {
    return {
      items: [],
      total: 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
  if (derivedUdises !== null) {
    and.push(udiseInChunksWhere(derivedUdises));
  }

  if (filters.state) {
    // SQLite: no case-insensitive mode; pass lower-case queries or use Postgres in production.
    and.push({
      OR: [
        { geographicState: { contains: filters.state } },
        { apiStateName: { contains: filters.state } },
        { state: { name: { contains: filters.state } } },
      ],
    });
  }
  if (filters.district) {
    and.push({ geographicDistrict: { contains: filters.district } });
  }
  if (filters.regionId) {
    and.push({ state: { regionId: filters.regionId } });
  }
  if (filters.minStudents != null || filters.maxStudents != null) {
    and.push({
      totalStudents: {
        ...(filters.minStudents != null ? { gte: filters.minStudents } : {}),
        ...(filters.maxStudents != null ? { lte: filters.maxStudents } : {}),
      },
    });
  }
  if (filters.minBoys != null) and.push({ totalBoys: { gte: filters.minBoys } });
  if (filters.maxBoys != null) and.push({ totalBoys: { lte: filters.maxBoys } });
  if (filters.minGirls != null) and.push({ totalGirls: { gte: filters.minGirls } });
  if (filters.maxGirls != null) and.push({ totalGirls: { lte: filters.maxGirls } });

  if (filters.minCompleteness != null) {
    and.push({ profileCompletenessPct: { gte: filters.minCompleteness } });
  }
  if (filters.maxCompleteness != null) {
    and.push({ profileCompletenessPct: { lte: filters.maxCompleteness } });
  }

  const w = boolFilter(filters.water as "yes" | "no" | undefined);
  if (w !== undefined) and.push({ waterAvailable: w });
  const e = boolFilter(filters.electricity as "yes" | "no" | undefined);
  if (e !== undefined) and.push({ electricityAvailable: e });
  const inet = boolFilter(filters.internet as "yes" | "no" | undefined);
  if (inet !== undefined) and.push({ internetAvailable: inet });

  if (filters.parsingStatus) and.push({ parsingStatus: filters.parsingStatus as never });
  if (filters.pipelineStatus) and.push({ pipelineStatus: filters.pipelineStatus as never });

  if (pagination.q) {
    and.push({
      OR: [
        { udise: { contains: pagination.q } },
        { schoolName: { contains: pagination.q } },
        { geographicDistrict: { contains: pagination.q } },
      ],
    });
  }

  const where: Prisma.SchoolWhereInput = and.length ? { AND: and } : {};

  const orderField = pagination.sort?.replace(/^-/, "") || "updatedAt";
  const orderDir = pagination.order;
  const orderBy = { [orderField]: orderDir } as Record<string, "asc" | "desc">;

  const [rows, total] = await Promise.all([
    prisma.school.findMany({
      where,
      take,
      skip,
      orderBy,
      include: schoolListInclude,
    }),
    prisma.school.count({ where }),
  ]);

  const items = disambiguateSchoolNames(rows.map(toSchoolListItem));
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

export async function getSchoolDetailRow(udiseRaw: string): Promise<SchoolDetailRow> {
  const prisma = getPrisma();
  const udise = normalizeUdise(udiseRaw);
  const school = await prisma.school.findUnique({
    where: { udise },
    include: schoolDetailInclude,
  });
  if (!school) throw new AppError("NOT_FOUND", `School ${udise} not found`, 404);
  return persistCompletenessIfChanged(school);
}

/** Canonical DTO for API responses (compare, PATCH responses, charts). */
export async function getSchoolCanonical(udiseRaw: string): Promise<SchoolCanonicalDto> {
  return toSchoolCanonical(await getSchoolDetailRow(udiseRaw));
}

/** GET /api/schools/:udise — DB-backed detail envelope (no PDF re-parse). */
export async function getSchoolDetailApi(udiseRaw: string): Promise<SchoolDetailApiResponse> {
  return toSchoolDetailApiResponse(await getSchoolDetailRow(udiseRaw));
}

export async function compareSchoolsCanonical(udisesRaw: string[]): Promise<{ schools: SchoolCanonicalDto[] }> {
  const prisma = getPrisma();
  const uniq = [...new Set(udisesRaw.map((u) => normalizeUdise(u)))].filter((u) => /^\d{11}$/.test(u)).slice(0, 4);
  if (uniq.length < 2) {
    throw new AppError("BAD_REQUEST", "Provide at least 2 valid 11-digit UDISE values (query: u)", 400);
  }
  const rows = await prisma.school.findMany({
    where: { udise: { in: uniq } },
    include: schoolCompareInclude,
  });
  const refreshed = await Promise.all(
    rows.map((r) => persistCompletenessIfChanged(compareRowAsDetailRowForCanonical(r))),
  );
  const map = new Map(refreshed.map((r) => [r.udise, r]));
  const schools: SchoolCanonicalDto[] = [];
  for (const u of uniq) {
    const row = map.get(u);
    if (!row) throw new AppError("NOT_FOUND", `School ${u} not found`, 404);
    schools.push(toSchoolCanonical(row));
  }
  return { schools };
}

export async function patchSchoolStatus(
  udiseRaw: string,
  body: { pipelineStatus: string },
  actorId: string,
) {
  const prisma = getPrisma();
  const udise = normalizeUdise(udiseRaw);
  const prev = await prisma.school.findUnique({ where: { udise } });
  if (!prev) throw new AppError("NOT_FOUND", "School not found", 404);
  if (prev.pipelineStatus === body.pipelineStatus) {
    return getSchoolCanonical(udise);
  }
  await prisma.school.update({
    where: { udise },
    data: { pipelineStatus: body.pipelineStatus as never },
  });
  await prisma.schoolProgress.create({
    data: {
      udise,
      fromStatus: prev.pipelineStatus,
      toStatus: body.pipelineStatus as never,
      userId: actorId,
    },
  });
  return getSchoolCanonical(udise);
}

export async function patchManualFields(
  udiseRaw: string,
  body: {
    manualRevenueOccupancy?: number;
    manualWashPrice?: number;
    manualWashesPerStudentMonth?: number;
  },
) {
  const prisma = getPrisma();
  const udise = normalizeUdise(udiseRaw);
  await prisma.school.update({
    where: { udise },
    data: {
      manualRevenueOccupancy: body.manualRevenueOccupancy,
      manualWashPrice: body.manualWashPrice,
      manualWashesPerStudentMonth: body.manualWashesPerStudentMonth,
    },
  });
  return getSchoolCanonical(udise);
}

export async function upsertNote(
  udiseRaw: string,
  body: {
    comments?: string;
    waterReliability?: string;
    electricityReliability?: string;
    spaceAvailable?: string;
    staffSupport?: string;
    followUpAt?: string;
  },
  createdById?: string,
) {
  const prisma = getPrisma();
  const udise = normalizeUdise(udiseRaw);
  await prisma.schoolNote.create({
    data: {
      udise,
      comments: body.comments,
      waterReliability: body.waterReliability,
      electricityReliability: body.electricityReliability,
      spaceAvailable: body.spaceAvailable,
      staffSupport: body.staffSupport,
      followUpAt: body.followUpAt ? new Date(body.followUpAt) : null,
      createdById,
    },
  });
  return getSchoolCanonical(udise);
}

export async function postRevenueCalculate(body: {
  udise: string;
  adoptionRate?: number;
  occupancyRate?: number;
  pricePerWash?: number;
  washesPerStudentPerMonth?: number;
}) {
  const school = await getSchoolDetailRow(body.udise);
  const head =
    school.totalStudents ??
    (school.totalBoys ?? 0) + (school.totalGirls ?? 0);
  const adoption =
    body.adoptionRate ??
    body.occupancyRate ??
    school.manualRevenueOccupancy ??
    0.85;
  return calculateRevenue({
    totalStudents: head,
    boys: school.totalBoys ?? undefined,
    girls: school.totalGirls ?? undefined,
    adoptionRate: adoption,
    pricePerWash: body.pricePerWash ?? school.manualWashPrice ?? 30,
    washesPerStudentPerMonth:
      body.washesPerStudentPerMonth ?? school.manualWashesPerStudentMonth ?? 4,
  });
}

export type SchoolInfraInsights = {
  totalSchools: number;
  facilities: {
    key: "water" | "electricity" | "internet" | "solar" | "playground" | "library";
    label: string;
    available: number;
    missing: number;
    pctAvailable: number;
  }[];
  coverageBuckets: { label: string; count: number }[];
  digitalAccess: {
    key: "smartClassTv" | "desktops" | "laptops" | "tablets";
    label: string;
    count: number;
    pct: number;
  }[];
};

export async function getSchoolInfraInsights(): Promise<SchoolInfraInsights> {
  const prisma = getPrisma();
  const rows = await prisma.school.findMany({
    select: {
      waterAvailable: true,
      electricityAvailable: true,
      internetAvailable: true,
      solarAvailable: true,
      playgroundAvailable: true,
      libraryAvailable: true,
      digital: {
        select: {
          smartClassTv: true,
          desktops: true,
          laptops: true,
          tablets: true,
        },
      },
    },
  });
  const totalSchools = rows.length;
  const safePct = (n: number) => (totalSchools > 0 ? Math.round((n / totalSchools) * 1000) / 10 : 0);

  const facilityDefs = [
    { key: "water", label: "Water", pick: (r: (typeof rows)[number]) => r.waterAvailable === true },
    { key: "electricity", label: "Electricity", pick: (r: (typeof rows)[number]) => r.electricityAvailable === true },
    { key: "internet", label: "Internet", pick: (r: (typeof rows)[number]) => r.internetAvailable === true },
    { key: "solar", label: "Solar", pick: (r: (typeof rows)[number]) => r.solarAvailable === true },
    { key: "playground", label: "Playground", pick: (r: (typeof rows)[number]) => r.playgroundAvailable === true },
    { key: "library", label: "Library", pick: (r: (typeof rows)[number]) => r.libraryAvailable === true },
  ] as const;

  const facilities = facilityDefs.map((f) => {
    const available = rows.reduce((acc, r) => acc + (f.pick(r) ? 1 : 0), 0);
    return {
      key: f.key,
      label: f.label,
      available,
      missing: Math.max(0, totalSchools - available),
      pctAvailable: safePct(available),
    };
  });

  const coverageBuckets = [
    { label: "0-2 facilities", count: 0 },
    { label: "3-4 facilities", count: 0 },
    { label: "5-6 facilities", count: 0 },
  ];
  for (const r of rows) {
    const n =
      (r.waterAvailable === true ? 1 : 0) +
      (r.electricityAvailable === true ? 1 : 0) +
      (r.internetAvailable === true ? 1 : 0) +
      (r.solarAvailable === true ? 1 : 0) +
      (r.playgroundAvailable === true ? 1 : 0) +
      (r.libraryAvailable === true ? 1 : 0);
    if (n <= 2) coverageBuckets[0]!.count += 1;
    else if (n <= 4) coverageBuckets[1]!.count += 1;
    else coverageBuckets[2]!.count += 1;
  }

  const digitalAccess = [
    {
      key: "smartClassTv" as const,
      label: "Smart class TV",
      count: rows.reduce((a, r) => a + ((r.digital?.smartClassTv ?? 0) > 0 ? 1 : 0), 0),
      pct: 0,
    },
    {
      key: "desktops" as const,
      label: "Desktops",
      count: rows.reduce((a, r) => a + ((r.digital?.desktops ?? 0) > 0 ? 1 : 0), 0),
      pct: 0,
    },
    {
      key: "laptops" as const,
      label: "Laptops",
      count: rows.reduce((a, r) => a + ((r.digital?.laptops ?? 0) > 0 ? 1 : 0), 0),
      pct: 0,
    },
    {
      key: "tablets" as const,
      label: "Tablets",
      count: rows.reduce((a, r) => a + ((r.digital?.tablets ?? 0) > 0 ? 1 : 0), 0),
      pct: 0,
    },
  ].map((d) => ({ ...d, pct: safePct(d.count) }));

  return { totalSchools, facilities, coverageBuckets, digitalAccess };
}
