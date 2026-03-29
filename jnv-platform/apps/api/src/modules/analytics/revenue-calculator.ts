import { z } from "zod";

const revenueInputBase = z.object({
  totalStudents: z.number().nonnegative(),
  boys: z.number().nonnegative().optional(),
  girls: z.number().nonnegative().optional(),
  /** Share of students using the service (0–1). */
  adoptionRate: z.number().min(0).max(1).default(0.85),
  pricePerWash: z.number().positive().default(30),
  washesPerStudentPerMonth: z.number().nonnegative().default(4),
  monthlyUsageDays: z.number().int().positive().default(22),
});

/** Accepts `occupancyRate` as a deprecated alias for `adoptionRate` (import / legacy clients). */
export const revenueInputSchema = z.preprocess((raw: unknown) => {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  if (o.adoptionRate == null && o.occupancyRate != null) {
    return { ...o, adoptionRate: o.occupancyRate };
  }
  return raw;
}, revenueInputBase);

export type RevenueInput = z.infer<typeof revenueInputSchema>;
/** Caller-facing input (defaults applied in `calculateRevenue`). `occupancyRate` is a legacy alias for `adoptionRate`. */
export type RevenueInputArg = {
  totalStudents: number;
  boys?: number;
  girls?: number;
  adoptionRate?: number;
  occupancyRate?: number;
  pricePerWash?: number;
  washesPerStudentPerMonth?: number;
  monthlyUsageDays?: number;
};

export type RevenueBreakdown = {
  monthlyRevenue: number;
  annualRevenue: number;
  revenueBoys: number;
  revenueGirls: number;
  revenueTotal: number;
  effectiveStudents: number;
  boysCount: number;
  girlsCount: number;
};

/**
 * Simple laundry-style revenue model: effective_students * washes_per_month * price_per_wash.
 * `adoptionRate` is the share of enrolled students using the service. Revenue is split by boys/girls
 * headcount share when counts exist; otherwise 50/50 on the monthly total.
 */
export function calculateRevenue(input: RevenueInputArg): RevenueBreakdown {
  const parsed = revenueInputSchema.parse(input);
  const total = parsed.totalStudents;
  let boys = parsed.boys ?? 0;
  let girls = parsed.girls ?? 0;
  if (boys + girls === 0 && total > 0) {
    boys = Math.round(total / 2);
    girls = total - boys;
  }
  if (boys + girls > 0 && total === 0) {
    /* use sum as total */
  }
  const headcount = total > 0 ? total : boys + girls;
  const effectiveStudents = headcount * parsed.adoptionRate;
  const monthlyWashes = effectiveStudents * parsed.washesPerStudentPerMonth;
  const monthlyRevenue = monthlyWashes * parsed.pricePerWash;
  const annualRevenue = monthlyRevenue * 12;

  const bRatio = headcount > 0 ? boys / headcount : 0.5;
  const gRatio = headcount > 0 ? girls / headcount : 0.5;

  return {
    monthlyRevenue: round2(monthlyRevenue),
    annualRevenue: round2(annualRevenue),
    revenueBoys: round2(monthlyRevenue * bRatio),
    revenueGirls: round2(monthlyRevenue * gRatio),
    revenueTotal: round2(monthlyRevenue),
    effectiveStudents: round2(effectiveStudents),
    boysCount: boys,
    girlsCount: girls,
  };
}

/** Default price, washes/month, and adoption for scenario presets. */
export function presetModelInputs(kind: "LOW" | "MEDIUM" | "HIGH"): {
  pricePerWash: number;
  washesPerStudentPerMonth: number;
  adoptionRate: number;
} {
  if (kind === "LOW") return { pricePerWash: 20, washesPerStudentPerMonth: 2, adoptionRate: 0.6 };
  if (kind === "MEDIUM") return { pricePerWash: 30, washesPerStudentPerMonth: 4, adoptionRate: 0.85 };
  return { pricePerWash: 40, washesPerStudentPerMonth: 6, adoptionRate: 0.95 };
}

export function scenarioPresets(kind: "LOW" | "MEDIUM" | "HIGH", base: RevenueInputArg): RevenueBreakdown {
  return calculateRevenue({ ...base, ...presetModelInputs(kind) });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
