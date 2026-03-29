import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export type DerivedListFilterInput = {
  minScRatioPct?: number;
  maxScRatioPct?: number;
  minStRatioPct?: number;
  maxStRatioPct?: number;
  minObcRatioPct?: number;
  maxObcRatioPct?: number;
  ageBand?: string;
  minAgeSharePct?: number;
  maxAgeSharePct?: number;
  minGirlsSharePct?: number;
  maxGirlsSharePct?: number;
};

function socialRatioExists(category: string, minPct: number, maxPct: number): Prisma.Sql {
  const denom = Prisma.sql`(
    SELECT COALESCE(
      (SELECT t.total FROM SchoolEnrolmentSocial t
       WHERE t.udise = School.udise AND t.category = 'Total' AND t.total IS NOT NULL LIMIT 1),
      (SELECT SUM(x.total) FROM SchoolEnrolmentSocial x
       WHERE x.udise = School.udise AND x.category IN ('SC','ST','OBC','General') AND x.total IS NOT NULL),
      School.totalStudents,
      0
    )
  )`;
  return Prisma.sql`
  EXISTS (
    SELECT 1 FROM SchoolEnrolmentSocial esc
    WHERE esc.udise = School.udise
      AND esc.category = ${category}
      AND esc.total IS NOT NULL AND esc.total >= 0
      AND ${denom} > 0
      AND (100.0 * esc.total) / ${denom} >= ${minPct}
      AND (100.0 * esc.total) / ${denom} <= ${maxPct}
  )`;
}

function ageBandShareExists(band: string, minPct: number, maxPct: number): Prisma.Sql {
  const denom = Prisma.sql`(
    SELECT COALESCE(
      (SELECT t.total FROM SchoolEnrolmentAge t
       WHERE t.udise = School.udise AND t.ageBand = 'Total' AND t.total IS NOT NULL LIMIT 1),
      (SELECT SUM(a.total) FROM SchoolEnrolmentAge a
       WHERE a.udise = School.udise AND a.ageBand != 'Total' AND a.total IS NOT NULL),
      School.totalStudents,
      0
    )
  )`;
  return Prisma.sql`
  EXISTS (
    SELECT 1 FROM SchoolEnrolmentAge ab
    WHERE ab.udise = School.udise
      AND ab.ageBand = ${band}
      AND ab.total IS NOT NULL AND ab.total >= 0
      AND ${denom} > 0
      AND (100.0 * ab.total) / ${denom} >= ${minPct}
      AND (100.0 * ab.total) / ${denom} <= ${maxPct}
  )`;
}

function girlsShareWhere(minPct: number, maxPct: number): Prisma.Sql {
  return Prisma.sql`
  (COALESCE(School.totalBoys, 0) + COALESCE(School.totalGirls, 0)) > 0
  AND (100.0 * COALESCE(School.totalGirls, 0)) / (COALESCE(School.totalBoys, 0) + COALESCE(School.totalGirls, 0)) >= ${minPct}
  AND (100.0 * COALESCE(School.totalGirls, 0)) / (COALESCE(School.totalBoys, 0) + COALESCE(School.totalGirls, 0)) <= ${maxPct}
  `;
}

/**
 * When any derived filter is active, returns UDISEs that satisfy all of them (AND).
 * Otherwise returns null (caller uses Prisma-only filters).
 */
export async function getUdisesMatchingDerivedFilters(
  prisma: PrismaClient,
  f: DerivedListFilterInput,
): Promise<string[] | null> {
  const parts: Prisma.Sql[] = [];

  const addSocial = (cat: string, minP?: number, maxP?: number) => {
    if (minP == null && maxP == null) return;
    const minV = minP ?? 0;
    const maxV = maxP ?? 100;
    parts.push(socialRatioExists(cat, minV, maxV));
  };
  addSocial("SC", f.minScRatioPct, f.maxScRatioPct);
  addSocial("ST", f.minStRatioPct, f.maxStRatioPct);
  addSocial("OBC", f.minObcRatioPct, f.maxObcRatioPct);

  if (
    f.ageBand &&
    f.ageBand.length > 0 &&
    (f.minAgeSharePct != null || f.maxAgeSharePct != null)
  ) {
    parts.push(
      ageBandShareExists(f.ageBand, f.minAgeSharePct ?? 0, f.maxAgeSharePct ?? 100),
    );
  }

  if (f.minGirlsSharePct != null || f.maxGirlsSharePct != null) {
    parts.push(girlsShareWhere(f.minGirlsSharePct ?? 0, f.maxGirlsSharePct ?? 100));
  }

  if (parts.length === 0) return null;

  const rows = await prisma.$queryRaw<{ udise: string }[]>(Prisma.sql`
    SELECT School.udise FROM School
    WHERE ${Prisma.join(parts, " AND ")}
  `);
  return rows.map((r) => r.udise);
}

export function udiseInChunksWhere(udises: string[], chunkSize = 500): Prisma.SchoolWhereInput {
  if (udises.length === 0) return { udise: { in: [] } };
  const chunks: string[][] = [];
  for (let i = 0; i < udises.length; i += chunkSize) {
    chunks.push(udises.slice(i, i + chunkSize));
  }
  if (chunks.length === 1) return { udise: { in: chunks[0]! } };
  return { OR: chunks.map((c) => ({ udise: { in: c } })) };
}
