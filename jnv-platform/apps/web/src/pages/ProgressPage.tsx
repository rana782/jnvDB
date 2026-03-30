import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../lib/api";
import type { DashboardProgress, RevenueProjectionResponse } from "../types/school-api";
import { PipelineBadge } from "../components/PipelineBadge";
import { PIPELINE_STATUS_ORDER } from "../lib/pipeline-status";
import { useMemo } from "react";

const REVENUE_PRESET_STORAGE_KEY = "jnv.revenue.presetInputs.v1";
type PresetKey = "LOW" | "MEDIUM" | "HIGH";
type PresetInputs = Record<PresetKey, { pricePerWash: number; washesPerStudentPerMonth: number; adoptionRate: number }>;
const DEFAULT_PRESET_INPUTS: PresetInputs = {
  LOW: { pricePerWash: 20, washesPerStudentPerMonth: 2, adoptionRate: 0.6 },
  MEDIUM: { pricePerWash: 30, washesPerStudentPerMonth: 4, adoptionRate: 0.85 },
  HIGH: { pricePerWash: 40, washesPerStudentPerMonth: 6, adoptionRate: 0.95 },
};

async function fetchProgressSummary(): Promise<DashboardProgress> {
  return apiJson<DashboardProgress>("/api/progress/summary");
}

function readSavedPresetInputs(): PresetInputs {
  if (typeof window === "undefined") return DEFAULT_PRESET_INPUTS;
  try {
    const raw = window.localStorage.getItem(REVENUE_PRESET_STORAGE_KEY);
    if (!raw) return DEFAULT_PRESET_INPUTS;
    const parsed = JSON.parse(raw) as Partial<PresetInputs>;
    const safe = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    return {
      LOW: {
        pricePerWash: safe(parsed?.LOW?.pricePerWash, DEFAULT_PRESET_INPUTS.LOW.pricePerWash),
        washesPerStudentPerMonth: safe(
          parsed?.LOW?.washesPerStudentPerMonth,
          DEFAULT_PRESET_INPUTS.LOW.washesPerStudentPerMonth,
        ),
        adoptionRate: safe(parsed?.LOW?.adoptionRate, DEFAULT_PRESET_INPUTS.LOW.adoptionRate),
      },
      MEDIUM: {
        pricePerWash: safe(parsed?.MEDIUM?.pricePerWash, DEFAULT_PRESET_INPUTS.MEDIUM.pricePerWash),
        washesPerStudentPerMonth: safe(
          parsed?.MEDIUM?.washesPerStudentPerMonth,
          DEFAULT_PRESET_INPUTS.MEDIUM.washesPerStudentPerMonth,
        ),
        adoptionRate: safe(parsed?.MEDIUM?.adoptionRate, DEFAULT_PRESET_INPUTS.MEDIUM.adoptionRate),
      },
      HIGH: {
        pricePerWash: safe(parsed?.HIGH?.pricePerWash, DEFAULT_PRESET_INPUTS.HIGH.pricePerWash),
        washesPerStudentPerMonth: safe(
          parsed?.HIGH?.washesPerStudentPerMonth,
          DEFAULT_PRESET_INPUTS.HIGH.washesPerStudentPerMonth,
        ),
        adoptionRate: safe(parsed?.HIGH?.adoptionRate, DEFAULT_PRESET_INPUTS.HIGH.adoptionRate),
      },
    };
  } catch {
    return DEFAULT_PRESET_INPUTS;
  }
}

async function fetchProjection(preset: PresetKey, presetInputs: PresetInputs): Promise<RevenueProjectionResponse> {
  return apiJson<RevenueProjectionResponse>("/api/revenue/projection", {
    method: "POST",
    body: JSON.stringify({
      preset,
      presetOverrides: {
        LOW: presetInputs.LOW,
        MEDIUM: presetInputs.MEDIUM,
        HIGH: presetInputs.HIGH,
      },
      schoolPage: 1,
      schoolPageSize: 25,
    }),
  });
}

export function ProgressPage() {
  const savedPresetInputs = useMemo(() => readSavedPresetInputs(), []);
  const presetFingerprint = useMemo(() => JSON.stringify(savedPresetInputs), [savedPresetInputs]);
  const q = useQuery({ queryKey: ["progress-summary"], queryFn: fetchProgressSummary });
  const lowQ = useQuery({
    queryKey: ["progress-revenue-low", presetFingerprint],
    queryFn: () => fetchProjection("LOW", savedPresetInputs),
  });
  const medQ = useQuery({
    queryKey: ["progress-revenue-medium", presetFingerprint],
    queryFn: () => fetchProjection("MEDIUM", savedPresetInputs),
  });
  const highQ = useQuery({
    queryKey: ["progress-revenue-high", presetFingerprint],
    queryFn: () => fetchProjection("HIGH", savedPresetInputs),
  });

  if (q.isPending) return <div className="text-muted">Loading progress…</div>;
  if (q.isError) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/15 p-4 text-sm text-amber-200">
        Could not load portfolio progress from the API.
      </div>
    );
  }

  const p = q.data;
  const done = p.schoolsPipelineDone;
  const total = p.totalSchools;
  const pct = p.completedPercent;

  const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold premium-gradient-text">Portfolio progress</h1>
        <p className="text-sm text-muted">
          Pipeline status per school (NOT_REVIEWED → DONE). Summary from{" "}
          <code className="rounded bg-surface-3 px-1 font-mono text-accent">GET /api/progress/summary</code> (same as{" "}
          <code className="rounded bg-surface-3 px-1 font-mono text-accent">/api/dashboard/progress</code>).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="premium-panel rounded-xl p-6 premium-ring lg:col-span-2">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Completion (pipeline DONE)</span>
            <span>
              {done} / {total} ({pct}%)
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-line">
            <div
              className="h-full bg-gradient-to-r from-accent to-success transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">Total completed % = schools with status DONE ÷ all schools.</p>
        </div>
        <div className="premium-panel rounded-xl p-6 premium-ring">
          <div className="text-xs uppercase text-muted">Revenue models (portfolio)</div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="font-semibold text-emerald-700">
              Low: {fmt(lowQ.data?.portfolio.monthlyRevenue ?? 0)} / mo · Annual {fmt(lowQ.data?.portfolio.annualRevenue ?? 0)}
            </div>
            <div className="font-semibold text-yellow-700">
              Medium: {fmt(medQ.data?.portfolio.monthlyRevenue ?? 0)} / mo · Annual {fmt(medQ.data?.portfolio.annualRevenue ?? 0)}
            </div>
            <div className="font-semibold text-rose-800">
              High: {fmt(highQ.data?.portfolio.monthlyRevenue ?? 0)} / mo · Annual {fmt(highQ.data?.portfolio.annualRevenue ?? 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <div className="premium-panel rounded-xl p-4 premium-ring">
          <h2 className="text-sm font-semibold text-ink">By pipeline status</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {PIPELINE_STATUS_ORDER.map((key) => {
              const v = p.pipeline[key] ?? 0;
              return (
                <li key={key} className="flex items-center justify-between gap-3">
                  <PipelineBadge status={key} />
                  <span className="tabular-nums text-ink">{v}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
