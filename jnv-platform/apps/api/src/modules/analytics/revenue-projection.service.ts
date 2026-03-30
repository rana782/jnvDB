import { z } from "zod";
import { getPrisma } from "../../shared/prisma.js";
import { calculateRevenue, presetModelInputs } from "./revenue-calculator.js";

const presetOverridesSchema = z
  .object({
    LOW: z
      .object({
        pricePerWash: z.number().positive().optional(),
        washesPerStudentPerMonth: z.number().nonnegative().optional(),
        adoptionRate: z.number().min(0).max(1).optional(),
      })
      .optional(),
    MEDIUM: z
      .object({
        pricePerWash: z.number().positive().optional(),
        washesPerStudentPerMonth: z.number().nonnegative().optional(),
        adoptionRate: z.number().min(0).max(1).optional(),
      })
      .optional(),
    HIGH: z
      .object({
        pricePerWash: z.number().positive().optional(),
        washesPerStudentPerMonth: z.number().nonnegative().optional(),
        adoptionRate: z.number().min(0).max(1).optional(),
      })
      .optional(),
  })
  .optional();

export const revenueProjectionBodySchema = z.object({
  preset: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  presetOverrides: presetOverridesSchema,
  pricePerWash: z.number().positive().optional(),
  washesPerStudentPerMonth: z.number().nonnegative().optional(),
  adoptionRate: z.number().min(0).max(1).optional(),
  occupancyRate: z.number().min(0).max(1).optional(),
  schoolPage: z.number().int().positive().optional(),
  schoolPageSize: z.number().int().positive().max(500).optional(),
});

export type RevenueProjectionBody = z.infer<typeof revenueProjectionBodySchema>;

export type RevenueProjectionSchoolRow = {
  udise: string;
  schoolName: string;
  state: string;
  totalStudents: number;
  boys: number;
  girls: number;
  monthlyRevenue: number;
  annualRevenue: number;
  revenueBoys: number;
  revenueGirls: number;
};

export type RevenueProjectionStateRow = {
  state: string;
  schoolCount: number;
  totalStudents: number;
  boys: number;
  girls: number;
  monthlyRevenue: number;
  annualRevenue: number;
};

function resolveModel(body: RevenueProjectionBody): {
  pricePerWash: number;
  washesPerStudentPerMonth: number;
  adoptionRate: number;
  preset: "LOW" | "MEDIUM" | "HIGH" | null;
} {
  const preset = body.preset ?? null;
  const base = preset
    ? presetModelInputs(preset, body.presetOverrides)
    : { pricePerWash: 30, washesPerStudentPerMonth: 4, adoptionRate: 0.85 };
  const adoption = body.adoptionRate ?? body.occupancyRate ?? base.adoptionRate;
  return {
    pricePerWash: body.pricePerWash ?? base.pricePerWash,
    washesPerStudentPerMonth: body.washesPerStudentPerMonth ?? base.washesPerStudentPerMonth,
    adoptionRate: adoption,
    preset,
  };
}

/**
 * Dynamic portfolio revenue from live enrolment: per school, rolled up by state, plus totals.
 */
export async function computeRevenueProjection(body: RevenueProjectionBody) {
  const model = resolveModel(body);
  const prisma = getPrisma();
  const schools = await prisma.school.findMany({
    select: {
      udise: true,
      schoolName: true,
      geographicState: true,
      totalStudents: true,
      totalBoys: true,
      totalGirls: true,
    },
  });

  const schoolRows: RevenueProjectionSchoolRow[] = [];
  let portfolioMonthly = 0;
  let portfolioAnnual = 0;
  let totalStudents = 0;
  let totalBoys = 0;
  let totalGirls = 0;

  const byState = new Map<
    string,
    { schoolCount: number; totalStudents: number; boys: number; girls: number; monthly: number; annual: number }
  >();

  for (const s of schools) {
    const head =
      s.totalStudents ??
      ((s.totalBoys ?? 0) + (s.totalGirls ?? 0) > 0 ? (s.totalBoys ?? 0) + (s.totalGirls ?? 0) : 0);
    const r = calculateRevenue({
      totalStudents: head,
      boys: s.totalBoys ?? undefined,
      girls: s.totalGirls ?? undefined,
      pricePerWash: model.pricePerWash,
      washesPerStudentPerMonth: model.washesPerStudentPerMonth,
      adoptionRate: model.adoptionRate,
    });
    const state = (s.geographicState?.trim() || "Unknown") as string;
    portfolioMonthly += r.monthlyRevenue;
    portfolioAnnual += r.annualRevenue;
    totalStudents += head;
    totalBoys += r.boysCount;
    totalGirls += r.girlsCount;

    if (!byState.has(state)) {
      byState.set(state, { schoolCount: 0, totalStudents: 0, boys: 0, girls: 0, monthly: 0, annual: 0 });
    }
    const agg = byState.get(state)!;
    agg.schoolCount++;
    agg.totalStudents += head;
    agg.boys += r.boysCount;
    agg.girls += r.girlsCount;
    agg.monthly += r.monthlyRevenue;
    agg.annual += r.annualRevenue;

    schoolRows.push({
      udise: s.udise,
      schoolName: s.schoolName,
      state,
      totalStudents: head,
      boys: r.boysCount,
      girls: r.girlsCount,
      monthlyRevenue: r.monthlyRevenue,
      annualRevenue: r.annualRevenue,
      revenueBoys: r.revenueBoys,
      revenueGirls: r.revenueGirls,
    });
  }

  schoolRows.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue || a.udise.localeCompare(b.udise));

  const page = body.schoolPage ?? 1;
  const pageSize = body.schoolPageSize ?? 25;
  const start = (page - 1) * pageSize;
  const schoolsPage = schoolRows.slice(start, start + pageSize);

  const byStateList: RevenueProjectionStateRow[] = [...byState.entries()]
    .map(([state, v]) => ({
      state,
      schoolCount: v.schoolCount,
      totalStudents: v.totalStudents,
      boys: v.boys,
      girls: v.girls,
      monthlyRevenue: round2(v.monthly),
      annualRevenue: round2(v.annual),
    }))
    .sort((a, b) => a.state.localeCompare(b.state));

  return {
    model: {
      ...model,
      preset: model.preset,
    },
    portfolio: {
      schoolCount: schools.length,
      totalStudents,
      totalBoys,
      totalGirls,
      monthlyRevenue: round2(portfolioMonthly),
      annualRevenue: round2(portfolioAnnual),
    },
    byState: byStateList,
    schools: schoolsPage,
    schoolsTotal: schoolRows.length,
    schoolsPage: page,
    schoolsPageSize: pageSize,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
