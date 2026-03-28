import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../lib/api";
import type { DashboardProgress } from "../types/school-api";

async function fetchProgress(): Promise<DashboardProgress> {
  return apiJson<DashboardProgress>("/api/dashboard/progress");
}

export function ProgressPage() {
  const q = useQuery({ queryKey: ["dashboard-progress"], queryFn: fetchProgress });

  if (q.isPending) return <div className="text-slate-500">Loading progress…</div>;
  if (q.isError) {
    return (
      <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
        Could not load portfolio progress from the API.
      </div>
    );
  }

  const p = q.data;
  const done = p.schoolsPipelineDone;
  const total = p.totalSchools;
  const pct = p.pipelineDonePercent;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Portfolio progress</h1>
        <p className="text-sm text-slate-400">Pipeline and parsing counts from `/api/dashboard/progress`.</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-navy-light p-6">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Pipeline DONE</span>
          <span>
            {done} / {total} ({pct}%)
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full bg-gradient-to-r from-teal to-emerald" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-navy-light p-4">
          <h2 className="text-sm font-semibold text-slate-200">By pipeline status</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {Object.entries(p.pipeline).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="text-slate-200">{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-navy-light p-4">
          <h2 className="text-sm font-semibold text-slate-200">By parsing status</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {Object.entries(p.parsing).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="text-slate-200">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
