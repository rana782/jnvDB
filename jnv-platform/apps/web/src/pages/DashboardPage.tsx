import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../lib/api";
import type { DashboardSummary } from "../types/school-api";

async function fetchSummary(): Promise<DashboardSummary> {
  return apiJson<DashboardSummary>("/api/dashboard/summary");
}

export function DashboardPage() {
  const q = useQuery({ queryKey: ["summary"], queryFn: fetchSummary });

  if (q.isPending) return <Skeleton />;
  if (q.isError) {
    return (
      <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
        Could not load dashboard. Ensure the API is running and you are online.
      </div>
    );
  }

  const s = q.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">Portfolio snapshot from `/api/dashboard/summary`.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Schools tracked" value={s.totalSchools} hint="Imported rows" />
        <StatCard label="Students (sum)" value={s.totalStudents} hint="Where counts exist" />
        <StatCard label="Pipeline done" value={s.schoolsCompleted} hint="Completion status" />
        <StatCard
          label="Portfolio monthly ₹"
          value={Math.round(s.portfolioMonthlyRevenue)}
          hint="CUSTOM scenarios summed"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-navy-light p-4 text-sm text-slate-300">
          <div className="text-xs uppercase text-slate-500">Enrolment split</div>
          <div className="mt-2 flex gap-6">
            <div>
              <div className="text-2xl font-semibold text-white">{s.totalBoys.toLocaleString()}</div>
              <div className="text-xs text-slate-500">Boys</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white">{s.totalGirls.toLocaleString()}</div>
              <div className="text-xs text-slate-500">Girls</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-navy-light p-4 text-sm text-slate-300">
          <div className="text-xs uppercase text-slate-500">Annual revenue (model)</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-light">
            ₹{Math.round(s.portfolioAnnualRevenue).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-navy-light p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function Skeleton() {
  return <div className="animate-pulse text-slate-500">Loading dashboard…</div>;
}
