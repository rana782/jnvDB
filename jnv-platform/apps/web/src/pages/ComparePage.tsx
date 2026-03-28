import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../lib/api";
import type { SchoolCanonical } from "../types/school-api";

type CompareResponse = { schools: SchoolCanonical[] };

async function fetchCompare(udises: string[]): Promise<CompareResponse> {
  const qs = new URLSearchParams();
  for (const u of udises) qs.append("u", u);
  return apiJson<CompareResponse>(`/api/schools/compare?${qs.toString()}`);
}

export function ComparePage() {
  const [params] = useSearchParams();
  const udises = useMemo(() => {
    const raw = params.getAll("u");
    const flat = raw.flatMap((s) => s.split(",").map((x) => x.trim()).filter(Boolean));
    const valid = flat.filter((u) => /^\d{11}$/.test(u)).slice(0, 4);
    return valid.length >= 2 ? valid : [];
  }, [params]);

  const q = useQuery({
    queryKey: ["compare", udises.join(",")],
    queryFn: () => fetchCompare(udises),
    enabled: udises.length >= 2,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Compare schools</h1>
        <p className="text-sm text-slate-400">
          URL-driven selection: <code className="text-teal-light">/compare?u=27200100101&u=09100100102</code> (2–4 UDISE
          codes).
        </p>
      </div>
      {udises.length < 2 ? (
        <p className="text-sm text-slate-500">Add at least two valid 11-digit UDISE query parameters to compare.</p>
      ) : null}
      {q.isError ? (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          Could not load comparison from the API.
        </div>
      ) : null}
      {q.isPending && udises.length >= 2 ? <div className="text-slate-500">Loading…</div> : null}
      {q.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.schools.map((s) => (
            <div key={s.udise} className="rounded-xl border border-slate-800 bg-navy-light p-4">
              <div className="font-mono text-xs text-teal-light">{s.udise}</div>
              <div className="text-lg font-semibold text-white">{s.profile.schoolName}</div>
              <dl className="mt-3 space-y-1 text-sm text-slate-400">
                <div className="flex justify-between">
                  <dt>State</dt>
                  <dd className="text-slate-200">{s.location.geographicState}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Students</dt>
                  <dd className="text-slate-200">{s.enrolmentHeadcount.totalStudents ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Pipeline</dt>
                  <dd className="text-slate-200">{s.pipelineStatus}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Parse</dt>
                  <dd className="text-slate-200">{s.provenance.parsingStatus}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
