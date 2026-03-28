import { z } from "zod";

export const revenueInputSchema = z.object({
  totalStudents: z.number().nonnegative(),
  boys: z.number().nonnegative().optional(),
  girls: z.number().nonnegative().optional(),
  occupancyRate: z.number().min(0).max(1).default(0.85),
  pricePerWash: z.number().positive().default(30),
  washesPerStudentPerMonth: z.number().nonnegative().default(4),
  monthlyUsageDays: z.number().int().positive().default(22),
});

export type RevenueInput = z.infer<typeof revenueInputSchema>;
/** Arguments accepted by `calculateRevenue` (Zod applies defaults for omitted fields). */
export type RevenueInputArg = z.input<typeof revenueInputSchema>;

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
 * Splits by boys/girls proportionally when counts exist; otherwise all on total.
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
  const effectiveStudents = headcount * parsed.occupancyRate;
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

export function scenarioPresets(
  kind: "LOW" | "MEDIUM" | "HIGH",
  base: RevenueInputArg,
): RevenueBreakdown {
  const price = kind === "LOW" ? 20 : kind === "MEDIUM" ? 30 : 40;
  const washes = kind === "LOW" ? 2 : kind === "MEDIUM" ? 4 : 6;
  const occ = kind === "LOW" ? 0.6 : kind === "MEDIUM" ? 0.85 : 0.95;
  return calculateRevenue({ ...base, pricePerWash: price, washesPerStudentPerMonth: washes, occupancyRate: occ });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
