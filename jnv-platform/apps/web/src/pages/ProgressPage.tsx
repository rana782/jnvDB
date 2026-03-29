import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../lib/api";
import type { DashboardProgress } from "../types/school-api";
import { PipelineBadge } from "../components/PipelineBadge";
import { PIPELINE_STATUS_ORDER } from "../lib/pipeline-status";

async function fetchProgressSummary(): Promise<DashboardProgress> {
  return apiJson<DashboardProgress>("/api/progress/summary");
}

export function ProgressPage() {
  const q = useQuery({ queryKey: ["progress-summary"], queryFn: fetchProgressSummary });

  if (q.isPending) return <div className="text-muted">Loading progress…</div>;
  if (q.isError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Could not load portfolio progress from the API.
      </div>
    );
  }

  const p = q.data;
  const done = p.schoolsPipelineDone;
  const total = p.totalSchools;
  const pct = p.completedPercent;

  const fmt = (n: number) => `₹${Math.round(n).toLocaleString()}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Portfolio progress</h1>
        <p className="text-sm text-muted">
          Pipeline status per school (NOT_REVIEWED → DONE). Summary from{" "}
          <code className="rounded bg-canvas px-1 font-mono text-accent">GET /api/progress/summary</code> (same as{" "}
          <code className="rounded bg-canvas px-1 font-mono text-accent">/api/dashboard/progress</code>). Revenue uses stored CUSTOM scenarios for
          schools marked DONE.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-line bg-card p-6 shadow-sm lg:col-span-2">
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
        <div className="rounded-xl border border-line bg-card p-6 shadow-sm">
          <div className="text-xs uppercase text-muted">Revenue from completed schools</div>
          <div className="mt-2 text-lg font-semibold text-success">{fmt(p.completedRevenueMonthly)} / mo</div>
          <div className="text-sm text-muted">Annual {fmt(p.completedRevenueAnnual)}</div>
          <p className="mt-2 text-xs text-muted">Sum of CUSTOM scenario rows for DONE schools (see Revenue lab for model).</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
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
        <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">By parsing status</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {Object.entries(p.parsing).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="text-ink">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
