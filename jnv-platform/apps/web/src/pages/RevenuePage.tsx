import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiJson } from "../lib/api";
import type { SchoolCanonical, SchoolListResponse } from "../types/school-api";

type Scenario = {
  monthlyRevenue: number;
  annualRevenue: number;
  revenueTotal: number;
};

type PresetBundle = { low: Scenario; medium: Scenario; high: Scenario; custom: Scenario };

export function RevenuePage() {
  const [udise, setUdise] = useState("");
  const [occupancy, setOccupancy] = useState(0.85);
  const [price, setPrice] = useState(30);
  const [washes, setWashes] = useState(4);

  const listQ = useQuery({
    queryKey: ["schools", "revenue-default"],
    queryFn: () => apiJson<SchoolListResponse>("/api/schools?page=1&pageSize=1"),
  });

  useEffect(() => {
    const first = listQ.data?.items[0]?.udise;
    if (first && udise === "") setUdise(first);
  }, [listQ.data, udise]);

  const schoolQ = useQuery({
    queryKey: ["school", udise],
    queryFn: () => apiJson<SchoolCanonical>(`/api/schools/${udise}`),
    enabled: udise.length === 11,
  });

  const head = schoolQ.data?.enrolmentHeadcount;
  const totalStudents =
    head?.totalStudents ??
    (head?.totalBoys != null || head?.totalGirls != null ? (head?.totalBoys ?? 0) + (head?.totalGirls ?? 0) : 0);

  const presets = useQuery({
    queryKey: ["revenue-presets", udise, totalStudents],
    queryFn: () =>
      apiJson<PresetBundle>("/api/revenue/scenarios", {
        method: "POST",
        body: JSON.stringify({
          totalStudents: totalStudents || 1,
          boys: head?.totalBoys ?? Math.floor((totalStudents || 1) / 2),
          girls: head?.totalGirls ?? Math.ceil((totalStudents || 1) / 2),
        }),
      }),
    enabled: !!schoolQ.data && totalStudents > 0,
  });

  const custom = useMutation({
    mutationFn: async () =>
      apiJson<Scenario>("/api/revenue/calculate", {
        method: "POST",
        body: JSON.stringify({
          udise,
          occupancyRate: occupancy,
          pricePerWash: price,
          washesPerStudentPerMonth: washes,
        }),
      }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Revenue lab</h1>
        <p className="text-sm text-slate-400">Presets use enrolment from `/api/schools/:udise`.</p>
      </div>

      {schoolQ.isError ? (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          Could not load school {udise}. Check UDISE and API.
        </div>
      ) : null}

      {schoolQ.isPending ? <div className="text-slate-500">Loading school…</div> : null}

      {schoolQ.data && totalStudents <= 0 ? (
        <div className="text-sm text-slate-400">This school has no student headcount in the database yet.</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {(presets.data ? Object.entries(presets.data) : []).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-navy-light p-4">
            <div className="text-xs uppercase text-slate-500">{k}</div>
            <div className="mt-2 text-lg font-semibold text-emerald-light">₹{v.monthlyRevenue.toLocaleString()}/mo</div>
            <div className="text-xs text-slate-500">Annual ₹{v.annualRevenue.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-800 bg-navy-light p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs text-slate-400">
            UDISE
            <input
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={udise}
              onChange={(e) => setUdise(e.target.value.replace(/\D/g, "").slice(0, 11))}
            />
          </label>
          <label className="text-xs text-slate-400">
            Occupancy
            <input
              type="number"
              step="0.05"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={occupancy}
              onChange={(e) => setOccupancy(Number(e.target.value))}
            />
          </label>
          <label className="text-xs text-slate-400">
            ₹ / wash
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </label>
          <label className="text-xs text-slate-400">
            Washes / student / mo
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={washes}
              onChange={(e) => setWashes(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-4 rounded-md bg-teal px-4 py-2 text-sm font-medium text-white"
          onClick={() => custom.mutate()}
        >
          Recalculate for school
        </button>
        {custom.data ? (
          <div className="mt-4 text-sm text-slate-300">
            Monthly ₹{custom.data.monthlyRevenue.toLocaleString()} · Annual ₹
            {custom.data.annualRevenue.toLocaleString()}
          </div>
        ) : null}
      </div>
    </div>
  );
}
