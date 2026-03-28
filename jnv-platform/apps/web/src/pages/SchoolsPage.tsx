import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiJson } from "../lib/api";
import type { SchoolListResponse } from "../types/school-api";
import { useUrlFilters } from "../hooks/useUrlFilters";

async function fetchSchools(search: URLSearchParams): Promise<SchoolListResponse> {
  const qs = search.toString();
  return apiJson<SchoolListResponse>(`/api/schools?${qs}`);
}

export function SchoolsPage() {
  const { filters, setFilters } = useUrlFilters();
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.state) params.set("state", filters.state);
  if (filters.pipelineStatus) params.set("pipelineStatus", filters.pipelineStatus);
  params.set("page", String(filters.page));
  params.set("pageSize", "25");

  const q = useQuery({
    queryKey: ["schools", params.toString()],
    queryFn: () => fetchSchools(params),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Schools</h1>
          <p className="text-sm text-slate-400">Filters sync to the URL for sharing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Search UDISE / name"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value, page: 1 })}
          />
          <input
            placeholder="State contains"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            value={filters.state}
            onChange={(e) => setFilters({ state: e.target.value, page: 1 })}
          />
          <select
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            value={filters.pipelineStatus}
            onChange={(e) => setFilters({ pipelineStatus: e.target.value, page: 1 })}
          >
            <option value="">All pipeline</option>
            <option value="UNREVIEWED">Unreviewed</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="DONE">Done</option>
          </select>
        </div>
      </div>
      {q.isError ? (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
          Could not load schools from the API.
        </div>
      ) : null}
      {q.isPending ? <div className="text-slate-500">Loading…</div> : null}
      {q.data ? (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">UDISE</th>
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((s) => (
                <tr key={s.udise} className="border-t border-slate-800/80">
                  <td className="px-4 py-3 font-mono text-teal-light">
                    <Link className="hover:underline" to={`/schools/${s.udise}`}>
                      {s.udise}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white">{s.schoolName}</td>
                  <td className="px-4 py-3 text-slate-400">{s.geographicState ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{s.geographicDistrict ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-300">{s.totalStudents ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{s.pipelineStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/50 px-4 py-3 text-xs text-slate-500">
            <span>
              Page {q.data.page} · {q.data.total} total
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-40"
                disabled={q.data.page <= 1}
                onClick={() => setFilters({ page: Math.max(1, filters.page - 1) })}
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-40"
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
