import { z } from "zod";
import { getPrisma } from "../../shared/prisma.js";
import { AppError } from "../../shared/errors.js";
import { normalizeUdise } from "../../shared/udise.js";
import type { PaginationQuery } from "../../shared/pagination.js";
import { offsetLimit } from "../../shared/pagination.js";
import { calculateRevenue } from "../analytics/revenue-calculator.js";
import type { Prisma } from "@prisma/client";
import {
  schoolDetailInclude,
  schoolListInclude,
  toSchoolCanonical,
  toSchoolListItem,
  type SchoolCanonicalDto,
  type SchoolDetailRow,
} from "./school.dto.js";

export const schoolFilterSchema = z.object({
  state: z.string().optional(),
  district: z.string().optional(),
  regionId: z.string().optional(),
  minStudents: z.coerce.number().optional(),
  maxStudents: z.coerce.number().optional(),
  minBoys: z.coerce.number().optional(),
  minGirls: z.coerce.number().optional(),
  water: z.enum(["yes", "no"]).optional(),
  electricity: z.enum(["yes", "no"]).optional(),
  internet: z.enum(["yes", "no"]).optional(),
  parsingStatus: z.string().optional(),
  pipelineStatus: z.string().optional(),
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

  if (filters.state) {
    // SQLite: no case-insensitive mode; pass lower-case queries or use Postgres in production.
    and.push({
      OR: [
        { geographicState: { contains: filters.state } },
        { apiStateName: { contains: filters.state } },
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
  if (filters.minGirls != null) and.push({ totalGirls: { gte: filters.minGirls } });

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

  return {
    items: rows.map(toSchoolListItem),
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
  return school;
}

/** Canonical DTO for API responses (detail, compare, mutations). */
export async function getSchoolCanonical(udiseRaw: string): Promise<SchoolCanonicalDto> {
  return toSchoolCanonical(await getSchoolDetailRow(udiseRaw));
}

export async function compareSchoolsCanonical(udisesRaw: string[]): Promise<{ schools: SchoolCanonicalDto[] }> {
  const prisma = getPrisma();
  const uniq = [...new Set(udisesRaw.map((u) => normalizeUdise(u)))].filter((u) => /^\d{11}$/.test(u)).slice(0, 4);
  if (uniq.length < 2) {
    throw new AppError("BAD_REQUEST", "Provide at least 2 valid 11-digit UDISE values (query: u)", 400);
  }
  const rows = await prisma.school.findMany({
    where: { udise: { in: uniq } },
    include: schoolDetailInclude,
  });
  const map = new Map(rows.map((r) => [r.udise, r]));
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
  body: { pipelineStatus?: string },
  actorId: string,
) {
  const prisma = getPrisma();
  const udise = normalizeUdise(udiseRaw);
  const prev = await prisma.school.findUnique({ where: { udise } });
  if (!prev) throw new AppError("NOT_FOUND", "School not found", 404);
  if (body.pipelineStatus) {
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
  }
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
  occupancyRate?: number;
  pricePerWash?: number;
  washesPerStudentPerMonth?: number;
}) {
  const school = await getSchoolDetailRow(body.udise);
  const head =
    school.totalStudents ??
    (school.totalBoys ?? 0) + (school.totalGirls ?? 0);
  return calculateRevenue({
    totalStudents: head,
    boys: school.totalBoys ?? undefined,
    girls: school.totalGirls ?? undefined,
    occupancyRate: body.occupancyRate ?? school.manualRevenueOccupancy ?? 0.85,
    pricePerWash: body.pricePerWash ?? school.manualWashPrice ?? 30,
    washesPerStudentPerMonth:
      body.washesPerStudentPerMonth ?? school.manualWashesPerStudentMonth ?? 4,
  });
}
