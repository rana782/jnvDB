import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fast } from "../lib/animationConfig";
import { PipelineBadge } from "../components/PipelineBadge";
import { apiJson } from "../lib/api";
import type { SchoolListResponse } from "../types/school-api";
import { useUrlFilters, type SchoolListUrlFilters } from "../hooks/useUrlFilters";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

async function fetchSchools(search: string): Promise<SchoolListResponse> {
  const qs = search.length ? `?${search}` : "";
  return apiJson<SchoolListResponse>(`/api/schools${qs}`);
}

function appendIfValue(params: URLSearchParams, key: string, raw: string) {
  const v = raw.trim();
  if (v !== "") params.set(key, v);
}

function buildQueryString(
  f: SchoolListUrlFilters,
  debouncedQ: string,
  debouncedState: string,
  pageSize: number,
): string {
  const params = new URLSearchParams();
  appendIfValue(params, "q", debouncedQ);
  appendIfValue(params, "state", debouncedState);
  appendIfValue(params, "district", f.district);
  appendIfValue(params, "pipelineStatus", f.pipelineStatus);
  appendIfValue(params, "parsingStatus", f.parsingStatus);
  appendIfValue(params, "minStudents", f.minStudents);
  appendIfValue(params, "maxStudents", f.maxStudents);
  appendIfValue(params, "minBoys", f.minBoys);
  appendIfValue(params, "maxBoys", f.maxBoys);
  appendIfValue(params, "minGirls", f.minGirls);
  appendIfValue(params, "maxGirls", f.maxGirls);
  appendIfValue(params, "minCompleteness", f.minCompleteness);
  appendIfValue(params, "maxCompleteness", f.maxCompleteness);
  appendIfValue(params, "minScRatioPct", f.minScRatioPct);
  appendIfValue(params, "maxScRatioPct", f.maxScRatioPct);
  appendIfValue(params, "minStRatioPct", f.minStRatioPct);
  appendIfValue(params, "maxStRatioPct", f.maxStRatioPct);
  appendIfValue(params, "minObcRatioPct", f.minObcRatioPct);
  appendIfValue(params, "maxObcRatioPct", f.maxObcRatioPct);
  appendIfValue(params, "ageBand", f.ageBand);
  appendIfValue(params, "minAgeSharePct", f.minAgeSharePct);
  appendIfValue(params, "maxAgeSharePct", f.maxAgeSharePct);
  appendIfValue(params, "minGirlsSharePct", f.minGirlsSharePct);
  appendIfValue(params, "maxGirlsSharePct", f.maxGirlsSharePct);
  params.set("page", String(f.page));
  params.set("pageSize", String(pageSize));
  return params.toString();
}

const numFieldClass =
  "w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink placeholder:text-muted";

export function SchoolsPage() {
  const { filters, setFilters, reset } = useUrlFilters();
  const [panelOpen, setPanelOpen] = useState(false);
  const debouncedQ = useDebouncedValue(filters.q, 320);
  const debouncedState = useDebouncedValue(filters.state, 320);

  const pageSize = 25;
  const queryString = useMemo(
    () => buildQueryString(filters, debouncedQ, debouncedState, pageSize),
    [filters, debouncedQ, debouncedState, pageSize],
  );

  const q = useQuery({
    queryKey: ["schools", queryString],
    queryFn: () => fetchSchools(queryString),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Schools</h1>
          <p className="text-sm text-muted">
            Filters sync to the URL; search debounces so the list updates smoothly.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            placeholder="Search UDISE / name / district"
            className="min-w-[200px] rounded-md border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted"
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value, page: 1 })}
          />
          <input
            placeholder="State contains"
            className="w-40 rounded-md border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted"
            value={filters.state}
            onChange={(e) => setFilters({ state: e.target.value, page: 1 })}
          />
          <select
            className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink"
            value={filters.pipelineStatus}
            onChange={(e) => setFilters({ pipelineStatus: e.target.value, page: 1 })}
          >
            <option value="">All pipeline</option>
            <option value="NOT_REVIEWED">Not reviewed</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="CONTACTED">Contacted</option>
            <option value="PILOT_READY">Pilot ready</option>
            <option value="PILOT_RUNNING">Pilot running</option>
            <option value="DONE">Done</option>
          </select>
          <button
            type="button"
            className="rounded-md border border-line px-3 py-2 text-sm text-ink transition-colors duration-100 hover:bg-canvas"
            onClick={() => setPanelOpen((o) => !o)}
          >
            {panelOpen ? "Hide filters" : "More filters"}
          </button>
          <button
            type="button"
            className="rounded-md border border-line px-3 py-2 text-sm text-muted transition-colors duration-100 hover:text-ink"
            onClick={() => {
              reset();
              setPanelOpen(false);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {panelOpen ? (
        <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Headcount & completeness
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-muted">
              Min students
              <input
                type="number"
                min={0}
                className={`mt-1 ${numFieldClass}`}
                value={filters.minStudents}
                onChange={(e) => setFilters({ minStudents: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Max students
              <input
                type="number"
                min={0}
                className={`mt-1 ${numFieldClass}`}
                value={filters.maxStudents}
                onChange={(e) => setFilters({ maxStudents: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Min boys
              <input
                type="number"
                min={0}
                className={`mt-1 ${numFieldClass}`}
                value={filters.minBoys}
                onChange={(e) => setFilters({ minBoys: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Max boys
              <input
                type="number"
                min={0}
                className={`mt-1 ${numFieldClass}`}
                value={filters.maxBoys}
                onChange={(e) => setFilters({ maxBoys: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Min girls
              <input
                type="number"
                min={0}
                className={`mt-1 ${numFieldClass}`}
                value={filters.minGirls}
                onChange={(e) => setFilters({ minGirls: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Max girls
              <input
                type="number"
                min={0}
                className={`mt-1 ${numFieldClass}`}
                value={filters.maxGirls}
                onChange={(e) => setFilters({ maxGirls: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Min completeness %
              <input
                type="number"
                min={0}
                max={100}
                className={`mt-1 ${numFieldClass}`}
                value={filters.minCompleteness}
                onChange={(e) => setFilters({ minCompleteness: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Max completeness %
              <input
                type="number"
                min={0}
                max={100}
                className={`mt-1 ${numFieldClass}`}
                value={filters.maxCompleteness}
                onChange={(e) => setFilters({ maxCompleteness: e.target.value, page: 1 })}
              />
            </label>
          </div>

          <p className="mb-3 mt-6 text-xs font-medium uppercase tracking-wide text-muted">
            Social category share of enrolment (SC / ST / OBC %)
          </p>
          <p className="mb-2 text-[11px] text-muted">
            Uses social enrolment rows vs Total row, sum of categories, or school headcount.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["SC", "minScRatioPct", "maxScRatioPct"],
                ["ST", "minStRatioPct", "maxStRatioPct"],
                ["OBC", "minObcRatioPct", "maxObcRatioPct"],
              ] as const
            ).map(([label, minK, maxK]) => (
              <div key={label} className="rounded-lg border border-line p-3">
                <p className="text-xs font-medium text-ink">{label} %</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-500">
                    Min
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className={`mt-0.5 ${numFieldClass}`}
                      value={filters[minK]}
                      onChange={(e) => setFilters({ [minK]: e.target.value, page: 1 })}
                    />
                  </label>
                  <label className="text-[11px] text-muted">
                    Max
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className={`mt-0.5 ${numFieldClass}`}
                      value={filters[maxK]}
                      onChange={(e) => setFilters({ [maxK]: e.target.value, page: 1 })}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <p className="mb-3 mt-6 text-xs font-medium uppercase tracking-wide text-muted">
            Age band share & girls share
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-muted">
              Age band (e.g. 14, Total)
              <input
                className={`mt-1 ${numFieldClass}`}
                placeholder="14"
                value={filters.ageBand}
                onChange={(e) => setFilters({ ageBand: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Min age-band %
              <input
                type="number"
                min={0}
                max={100}
                className={`mt-1 ${numFieldClass}`}
                value={filters.minAgeSharePct}
                onChange={(e) => setFilters({ minAgeSharePct: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Max age-band %
              <input
                type="number"
                min={0}
                max={100}
                className={`mt-1 ${numFieldClass}`}
                value={filters.maxAgeSharePct}
                onChange={(e) => setFilters({ maxAgeSharePct: e.target.value, page: 1 })}
              />
            </label>
            <label className="block text-xs text-muted">
              Girls % of (boys+girls)
              <div className="mt-1 grid grid-cols-2 gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="min"
                  className={numFieldClass}
                  value={filters.minGirlsSharePct}
                  onChange={(e) => setFilters({ minGirlsSharePct: e.target.value, page: 1 })}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="max"
                  className={numFieldClass}
                  value={filters.maxGirlsSharePct}
                  onChange={(e) => setFilters({ maxGirlsSharePct: e.target.value, page: 1 })}
                />
              </div>
            </label>
          </div>
        </div>
      ) : null}

      {q.isError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Could not load schools from the API.
        </div>
      ) : null}
      {q.isFetching ? <div className="text-sm text-muted">Updating…</div> : null}
      {q.isPending && !q.data ? <div className="text-muted">Loading…</div> : null}
      {q.data ? (
        <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">UDISE</th>
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3 text-right">Students</th>
                <th className="px-4 py-3 text-right">Boys</th>
                <th className="px-4 py-3 text-right">Girls</th>
                <th className="px-4 py-3 text-right">Complete</th>
                <th className="px-4 py-3">Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((s, i) => (
                <motion.tr
                  key={s.udise}
                  className="border-t border-line"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...fast, delay: Math.min(i * 0.025, 0.2) }}
                >
                  <td className="px-4 py-3 font-mono text-accent">
                    <Link className="transition-colors duration-100 hover:underline" to={`/schools/${s.udise}`}>
                      {s.udise}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">{s.schoolName}</td>
                  <td className="px-4 py-3 text-muted">{s.geographicState ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{s.geographicDistrict ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {s.totalStudents ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {s.totalBoys ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {s.totalGirls ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {s.profileCompletenessPct != null ? `${Math.round(s.profileCompletenessPct)}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <PipelineBadge status={s.pipelineStatus} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line bg-canvas px-4 py-3 text-xs text-muted">
            <span>
              Page {q.data.page} · {q.data.total} total
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-line px-2 py-1 text-ink transition-colors duration-100 hover:bg-canvas disabled:opacity-40"
                disabled={q.data.page <= 1}
                onClick={() => setFilters({ page: Math.max(1, filters.page - 1) })}
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded border border-line px-2 py-1 text-ink transition-colors duration-100 hover:bg-canvas disabled:opacity-40"
                disabled={q.data.page * q.data.pageSize >= q.data.total}
                onClick={() => setFilters({ page: filters.page + 1 })}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
