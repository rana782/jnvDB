import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiJson } from "../lib/api";
import type { DeploymentStrategyResponse } from "../types/school-api";

const TOOLTIP = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: "8px",
  boxShadow: "0 4px 24px rgba(15,23,42,0.08)",
};
const AXIS = { stroke: "#94a3b8", tick: { fill: "#64748b", fontSize: 11 } };

type RegionRow = { id: string; code: string; name: string };

function deploymentQs(sp: URLSearchParams): string {
  const p = new URLSearchParams();
  for (const key of [
    "state",
    "regionId",
    "minReadiness",
    "maxReadiness",
    "minMonthlyRevenue",
    "maxMonthlyRevenue",
    "topLimit",
  ] as const) {
    const v = sp.get(key);
    if (v != null && v !== "") p.set(key, v);
  }
  return p.toString();
}

async function fetchDeployment(qs: string): Promise<DeploymentStrategyResponse> {
  const suffix = qs.length ? `?${qs}` : "";
  return apiJson<DeploymentStrategyResponse>(`/api/dashboard/deployment${suffix}`);
}

async function fetchRegions(): Promise<RegionRow[]> {
  return apiJson<RegionRow[]>("/api/geo/regions");
}

export function DeploymentPage() {
  const [sp, setSp] = useSearchParams();
  const qs = useMemo(() => deploymentQs(sp), [sp]);

  const [draftState, setDraftState] = useState(sp.get("state") ?? "");
  const [draftRegion, setDraftRegion] = useState(sp.get("regionId") ?? "");
  const [draftMinR, setDraftMinR] = useState(sp.get("minReadiness") ?? "");
  const [draftMaxR, setDraftMaxR] = useState(sp.get("maxReadiness") ?? "");
  const [draftMinRev, setDraftMinRev] = useState(sp.get("minMonthlyRevenue") ?? "");
  const [draftMaxRev, setDraftMaxRev] = useState(sp.get("maxMonthlyRevenue") ?? "");

  useEffect(() => {
    setDraftState(sp.get("state") ?? "");
    setDraftRegion(sp.get("regionId") ?? "");
    setDraftMinR(sp.get("minReadiness") ?? "");
    setDraftMaxR(sp.get("maxReadiness") ?? "");
    setDraftMinRev(sp.get("minMonthlyRevenue") ?? "");
    setDraftMaxRev(sp.get("maxMonthlyRevenue") ?? "");
  }, [sp]);

  const deployQ = useQuery({
    queryKey: ["dashboard-deployment", qs],
    queryFn: () => fetchDeployment(qs),
    staleTime: 25_000,
  });

  const regionsQ = useQuery({
    queryKey: ["geo-regions"],
    queryFn: fetchRegions,
    staleTime: 300_000,
  });

  const applyFilters = useCallback(() => {
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        const setOrDel = (k: string, v: string) => {
          if (v.trim()) n.set(k, v.trim());
          else n.delete(k);
        };
        setOrDel("state", draftState);
        setOrDel("regionId", draftRegion);
        setOrDel("minReadiness", draftMinR);
        setOrDel("maxReadiness", draftMaxR);
        setOrDel("minMonthlyRevenue", draftMinRev);
        setOrDel("maxMonthlyRevenue", draftMaxRev);
        return n;
      },
      { replace: true },
    );
  }, [draftState, draftRegion, draftMinR, draftMaxR, draftMinRev, draftMaxRev, setSp]);

  const clearFilters = () => {
    setDraftState("");
    setDraftRegion("");
    setDraftMinR("");
    setDraftMaxR("");
    setDraftMinRev("");
    setDraftMaxRev("");
    setSp({}, { replace: true });
  };

  const formatInr = (n: number) => `₹${Math.round(n).toLocaleString()}`;

  if (deployQ.isError) {
    return (
      <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
        Could not load deployment strategy data from the API.
      </div>
    );
  }

  const d = deployQ.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Deployment strategy</h1>
          <p className="text-sm text-muted">
            Priority scores combine readiness, enrolment, facility flags, and digital inventory (weights from API). All
            figures are computed from live school rows and CUSTOM revenue scenarios.
          </p>
          <p className="mt-2 text-xs text-muted">
            From the map, select a state and open{" "}
            <span className="text-ink">Deployment strategy for this state</span> — or set filters below.{" "}
            <Link className="text-accent transition-colors duration-100 hover:underline" to="/map">
              Open map
            </Link>
            {sp.get("state") ? (
              <>
                {" · "}
                <Link
                  className="text-accent transition-colors duration-100 hover:underline"
                  to={`/map?${new URLSearchParams({ state: sp.get("state")! }).toString()}`}
                >
                  View {sp.get("state")} on map
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Filters</h2>
        <p className="text-xs text-muted">
          Match schools list behaviour: state uses geographic / API state name substring. Revenue uses latest CUSTOM
          monthly value per school.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="block text-xs text-muted">
            State (contains)
            <input
              className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink placeholder:text-muted"
              value={draftState}
              onChange={(e) => setDraftState(e.target.value)}
              placeholder="e.g. Maharashtra"
            />
          </label>
          <label className="block text-xs text-muted">
            Region (NVS)
            <select
              className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink"
              value={draftRegion}
              onChange={(e) => setDraftRegion(e.target.value)}
            >
              <option value="">All regions</option>
              {(regionsQ.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            Min readiness %
            <input
              type="number"
              min={0}
              max={100}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
              value={draftMinR}
              onChange={(e) => setDraftMinR(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="block text-xs text-muted">
            Max readiness %
            <input
              type="number"
              min={0}
              max={100}
              className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink"
              value={draftMaxR}
              onChange={(e) => setDraftMaxR(e.target.value)}
              placeholder="100"
            />
          </label>
          <label className="block text-xs text-muted">
            Min ₹ / mo (CUSTOM)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink"
              value={draftMinRev}
              onChange={(e) => setDraftMinRev(e.target.value)}
            />
          </label>
          <label className="block text-xs text-muted">
            Max ₹ / mo (CUSTOM)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink"
              value={draftMaxRev}
              onChange={(e) => setDraftMaxRev(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
            onClick={applyFilters}
          >
            Apply filters
          </button>
          <button
            type="button"
            className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-colors duration-100 hover:bg-canvas"
            onClick={clearFilters}
          >
            Clear
          </button>
        </div>
      </div>

      {deployQ.isPending ? (
        <div className="text-sm text-muted">Loading deployment data…</div>
      ) : d ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
              <div className="text-xs uppercase text-muted">Filtered schools</div>
              <div className="mt-2 text-2xl font-semibold text-ink">{d.progress.filteredSchoolCount}</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
              <div className="text-xs uppercase text-muted">Parse complete %</div>
              <div className="mt-2 text-2xl font-semibold text-success">
                {d.progress.parsingCompletePercent}%
              </div>
              <div className="text-xs text-muted">parsingStatus = COMPLETE</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
              <div className="text-xs uppercase text-muted">Pipeline DONE %</div>
              <div className="mt-2 text-2xl font-semibold text-accent">{d.progress.pipelineDonePercent}%</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
              <div className="text-xs uppercase text-muted">Pilot-ready schools</div>
              <div className="mt-2 text-2xl font-semibold text-warning">{d.progress.pilotSchoolsCount}</div>
              <div className="text-xs text-muted">pilotSuitable = true</div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-ink">Next targets</h2>
            <p className="text-xs text-muted">
              Highest priority among schools not yet pipeline DONE (within current filters).
            </p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {d.progress.nextTargets.length === 0 ? (
                <li className="py-2 text-muted">No schools in scope, or all DONE.</li>
              ) : (
                d.progress.nextTargets.map((t) => (
                  <li key={t.udise} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link className="font-medium text-accent transition-colors duration-100 hover:underline" to={`/schools/${t.udise}`}>
                        {t.schoolName}
                      </Link>
                      <span className="ml-2 text-xs text-muted">
                        {t.geographicState ?? "—"} · {t.pipelineStatus}
                      </span>
                    </div>
                    <div className="tabular-nums text-ink">
                      priority <span className="font-semibold text-ink">{t.priorityScore}</span>
                      {t.profileCompletenessPct != null ? (
                        <span className="ml-3 text-muted">readiness {t.profileCompletenessPct}%</span>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-card p-4 text-xs text-muted shadow-sm">
            <span className="font-medium text-ink">Priority weights</span>: readiness{" "}
            {(d.priorityWeights.readiness * 100).toFixed(0)}%, students{" "}
            {(d.priorityWeights.students * 100).toFixed(0)}%, infra{" "}
            {(d.priorityWeights.infra * 100).toFixed(0)}%, digital{" "}
            {(d.priorityWeights.digital * 100).toFixed(0)}%.
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-ink">Readiness distribution</h2>
              <p className="text-xs text-muted">Schools in current filter by profile completeness band</p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.readinessDistribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={AXIS.tick} stroke={AXIS.stroke} interval={0} angle={-12} height={48} />
                    <YAxis tick={AXIS.tick} stroke={AXIS.stroke} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: "#0F172A" }} />
                    <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} name="Schools" animationDuration={300} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-ink">State-wise revenue summary</h2>
              <p className="text-xs text-muted">Sum of CUSTOM monthly model by geographic state</p>
              <div className="mt-3 max-h-64 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-card text-xs text-muted">
                    <tr>
                      <th className="py-1 pr-2">State</th>
                      <th className="py-1 pr-2 text-right">Schools</th>
                      <th className="py-1 pr-2 text-right">Students</th>
                      <th className="py-1 pr-2 text-right">Avg ready</th>
                      <th className="py-1 text-right">₹ / mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.stateRevenueSummary.map((r) => (
                      <tr key={r.state} className="border-t border-line">
                        <td className="py-2 pr-2 text-ink">{r.state}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-muted">{r.schoolCount}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-ink">
                          {r.totalStudents.toLocaleString()}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums text-muted">
                          {r.avgReadiness != null ? `${r.avgReadiness}%` : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-success">
                          {formatInr(r.monthlyRevenueSum)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-ink">Top schools by priority</h2>
            <p className="text-xs text-muted">Sorted by deployment priority score (then headcount)</p>
            <div className="mt-3 max-h-[480px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-card text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2">Priority</th>
                    <th className="py-1 pr-2">School</th>
                    <th className="py-1 pr-2">State</th>
                    <th className="py-1 pr-2 text-right">R/S/I/D</th>
                    <th className="py-1 pr-2 text-right">Ready %</th>
                    <th className="py-1 pr-2 text-right">Students</th>
                    <th className="py-1 pr-2 text-right">₹ / mo</th>
                    <th className="py-1 pr-2">Pipeline</th>
                    <th className="py-1">Pilot</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topSchools.map((s) => (
                    <tr key={s.udise} className="border-t border-line">
                      <td className="py-2 pr-2 font-semibold tabular-nums text-accent">{s.priorityScore}</td>
                      <td className="py-2 pr-2">
                        <Link className="text-accent transition-colors duration-100 hover:underline" to={`/schools/${s.udise}`}>
                          {s.schoolName}
                        </Link>
                        <div className="text-[10px] text-muted">{s.udise}</div>
                      </td>
                      <td className="py-2 pr-2 text-ink">{s.geographicState ?? "—"}</td>
                      <td className="py-2 pr-2 text-right text-xs tabular-nums text-muted">
                        {s.breakdown.readiness}/{s.breakdown.students}/{s.breakdown.infra}/{s.breakdown.digital}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-muted">
                        {s.profileCompletenessPct != null ? `${s.profileCompletenessPct}%` : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-ink">
                        {s.totalStudents?.toLocaleString() ?? "—"}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-success">
                        {s.monthlyRevenue != null ? formatInr(s.monthlyRevenue) : "—"}
                      </td>
                      <td className="py-2 pr-2 text-xs text-muted">{s.pipelineStatus}</td>
                      <td className="py-2 text-xs text-muted">{s.pilotSuitable ? "Yes" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
