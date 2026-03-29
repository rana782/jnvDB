import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../lib/api";
import type {
  RevenueProjectionResponse,
  RevenueScenarioBreakdown,
  SchoolDetailResponse,
  SchoolListResponse,
} from "../types/school-api";

const PRESET_INPUTS = {
  LOW: { pricePerWash: 20, washesPerStudentPerMonth: 2, adoptionRate: 0.6 },
  MEDIUM: { pricePerWash: 30, washesPerStudentPerMonth: 4, adoptionRate: 0.85 },
  HIGH: { pricePerWash: 40, washesPerStudentPerMonth: 6, adoptionRate: 0.95 },
} as const;

type PresetKey = keyof typeof PRESET_INPUTS;

type PresetBundle = Record<"low" | "medium" | "high" | "custom", RevenueScenarioBreakdown>;

export function RevenuePage() {
  const [udise, setUdise] = useState("");
  const [activePreset, setActivePreset] = useState<PresetKey | "CUSTOM">("MEDIUM");
  const [price, setPrice] = useState<number>(PRESET_INPUTS.MEDIUM.pricePerWash);
  const [washes, setWashes] = useState<number>(PRESET_INPUTS.MEDIUM.washesPerStudentPerMonth);
  const [adoption, setAdoption] = useState<number>(PRESET_INPUTS.MEDIUM.adoptionRate);
  const [schoolPage, setSchoolPage] = useState(1);
  const schoolPageSize = 25;

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
    queryFn: () => apiJson<SchoolDetailResponse>(`/api/schools/${udise}`),
    enabled: udise.length === 11,
  });

  const head = schoolQ.data?.school.enrolmentHeadcount;
  const totalStudents =
    head?.totalStudents ??
    (head?.totalBoys != null || head?.totalGirls != null ? (head?.totalBoys ?? 0) + (head?.totalGirls ?? 0) : 0);

  const presets = useQuery({
    queryKey: ["revenue-presets", udise, totalStudents, head?.totalBoys, head?.totalGirls],
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

  const projectionBody = useMemo(
    () =>
      JSON.stringify({
        ...(activePreset !== "CUSTOM" ? { preset: activePreset } : {}),
        pricePerWash: price,
        washesPerStudentPerMonth: washes,
        adoptionRate: adoption,
        schoolPage,
        schoolPageSize,
      }),
    [activePreset, price, washes, adoption, schoolPage],
  );

  const projection = useQuery({
    queryKey: ["revenue-projection", projectionBody],
    queryFn: () =>
      apiJson<RevenueProjectionResponse>("/api/revenue/projection", {
        method: "POST",
        body: projectionBody,
      }),
  });

  const customSchool = useMutation({
    mutationFn: async () =>
      apiJson<RevenueScenarioBreakdown>("/api/revenue/calculate", {
        method: "POST",
        body: JSON.stringify({
          udise,
          adoptionRate: adoption,
          pricePerWash: price,
          washesPerStudentPerMonth: washes,
        }),
      }),
  });

  function applyPreset(p: PresetKey) {
    setActivePreset(p);
    const v = PRESET_INPUTS[p];
    setPrice(v.pricePerWash);
    setWashes(v.washesPerStudentPerMonth);
    setAdoption(v.adoptionRate);
    setSchoolPage(1);
  }

  function switchToCustom() {
    setActivePreset("CUSTOM");
    setSchoolPage(1);
  }

  const fmt = (n: number) => `₹${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Revenue lab</h1>
        <p className="text-sm text-muted">
          Model uses price per wash, washes per student per month, and adoption rate on total enrolment. Boys and girls
          splits allocate monthly revenue by headcount share. Portfolio totals are computed dynamically from all schools;
          import still stores LOW/MEDIUM/HIGH/CUSTOM rows per school for offline snapshots.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-card p-4 shadow-sm">
        <span className="w-full text-xs uppercase text-muted">Scenario preset</span>
        {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => (
          <button
            key={p}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
              activePreset === p ? "bg-accent text-white" : "bg-canvas text-ink hover:bg-line/80"
            }`}
            onClick={() => applyPreset(p)}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
            activePreset === "CUSTOM" ? "bg-accent text-white" : "bg-canvas text-ink hover:bg-line/80"
          }`}
          onClick={switchToCustom}
        >
          Custom
        </button>
      </div>

      <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs text-muted">
            ₹ / wash
            <input
              type="number"
              min={1}
              step={1}
              className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1 text-sm text-ink"
              value={price}
              onChange={(e) => {
                setPrice(Number(e.target.value));
                setActivePreset("CUSTOM");
                setSchoolPage(1);
              }}
            />
          </label>
          <label className="text-xs text-muted">
            Washes / student / month
            <input
              type="number"
              min={0}
              step={0.5}
              className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1 text-sm text-ink"
              value={washes}
              onChange={(e) => {
                setWashes(Number(e.target.value));
                setActivePreset("CUSTOM");
                setSchoolPage(1);
              }}
            />
          </label>
          <label className="text-xs text-muted">
            Adoption rate (0–1)
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1 text-sm text-ink"
              value={adoption}
              onChange={(e) => {
                setAdoption(Number(e.target.value));
                setActivePreset("CUSTOM");
                setSchoolPage(1);
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          Active model: ₹{projection.data?.model.pricePerWash ?? price} × {projection.data?.model.washesPerStudentPerMonth ?? washes}{" "}
          washes × {(projection.data?.model.adoptionRate ?? adoption) * 100}% adoption
          {projection.data?.model.preset ? ` (base ${projection.data.model.preset})` : ""}
        </p>
      </div>

      {projection.isError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Could not load portfolio projection.
        </div>
      ) : null}

      {projection.isPending ? (
        <div className="text-muted">Computing portfolio…</div>
      ) : projection.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-ink">Total portfolio (dynamic)</h2>
            <p className="mt-1 text-xs text-muted">
              {projection.data.portfolio.schoolCount} schools · {projection.data.portfolio.totalStudents.toLocaleString()}{" "}
              students ({projection.data.portfolio.totalBoys.toLocaleString()} boys,{" "}
              {projection.data.portfolio.totalGirls.toLocaleString()} girls)
            </p>
            <div className="mt-3 text-2xl font-semibold text-success">{fmt(projection.data.portfolio.monthlyRevenue)} / mo</div>
            <div className="text-sm text-muted">Annual {fmt(projection.data.portfolio.annualRevenue)}</div>
          </div>
          <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-ink">By state</h2>
            <div className="mt-2 max-h-56 overflow-y-auto text-sm">
              <table className="w-full text-left text-ink">
                <thead className="sticky top-0 bg-card text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2">State</th>
                    <th className="py-1 pr-2">Schools</th>
                    <th className="py-1 pr-2">Students</th>
                    <th className="py-1 pr-2">Mo</th>
                    <th className="py-1">Yr</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.data.byState.map((r) => (
                    <tr key={r.state} className="border-t border-line">
                      <td className="py-1.5 pr-2">{r.state}</td>
                      <td className="py-1.5 pr-2 text-muted">{r.schoolCount}</td>
                      <td className="py-1.5 pr-2 text-muted">{r.totalStudents.toLocaleString()}</td>
                      <td className="py-1.5 pr-2 text-success">{fmt(r.monthlyRevenue)}</td>
                      <td className="py-1.5 text-muted">{fmt(r.annualRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {projection.data ? (
        <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Per school (top by monthly revenue)</h2>
          <p className="text-xs text-muted">
            Page {projection.data.schoolsPage} of {Math.max(1, Math.ceil(projection.data.schoolsTotal / schoolPageSize))} ·{" "}
            {projection.data.schoolsTotal} schools
          </p>
          <div className="mt-2 max-h-96 overflow-x-auto overflow-y-auto text-sm">
            <table className="w-full min-w-[640px] text-left text-ink">
              <thead className="sticky top-0 bg-card text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2">UDISE</th>
                  <th className="py-1 pr-2">State</th>
                  <th className="py-1 pr-2">Students</th>
                  <th className="py-1 pr-2">B/G</th>
                  <th className="py-1 pr-2">Mo rev</th>
                  <th className="py-1 pr-2">Yr rev</th>
                  <th className="py-1">Boys ₹ / Girls ₹ (mo)</th>
                </tr>
              </thead>
              <tbody>
                {projection.data.schools.map((s) => (
                  <tr key={s.udise} className="border-t border-line">
                    <td className="py-1.5 pr-2 font-mono text-accent">{s.udise}</td>
                    <td className="py-1.5 pr-2 text-muted">{s.state}</td>
                    <td className="py-1.5 pr-2">{s.totalStudents.toLocaleString()}</td>
                    <td className="py-1.5 pr-2 text-muted">
                      {s.boys}/{s.girls}
                    </td>
                    <td className="py-1.5 pr-2 text-success">{fmt(s.monthlyRevenue)}</td>
                    <td className="py-1.5 pr-2 text-muted">{fmt(s.annualRevenue)}</td>
                    <td className="py-1.5 text-muted">
                      {fmt(s.revenueBoys)} / {fmt(s.revenueGirls)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-600 px-3 py-1 text-sm text-slate-300 disabled:opacity-40"
              disabled={schoolPage <= 1}
              onClick={() => setSchoolPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1 text-sm text-ink transition-colors duration-100 hover:bg-canvas disabled:opacity-40"
              disabled={schoolPage * schoolPageSize >= projection.data.schoolsTotal}
              onClick={() => setSchoolPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold text-ink">Single-school check</h2>
        <p className="text-sm text-muted">
          Presets below use this school&apos;s enrolment (boys/girls split). Use &quot;Recalculate&quot; to apply the inputs
          above.
        </p>
      </div>

      {schoolQ.isError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Could not load school {udise}. Check UDISE and API.
        </div>
      ) : null}

      {schoolQ.isPending ? <div className="text-muted">Loading school…</div> : null}

      {schoolQ.data && totalStudents <= 0 ? (
        <div className="text-sm text-muted">This school has no student headcount in the database yet.</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(presets.data ? (Object.entries(presets.data) as [string, RevenueScenarioBreakdown][]) : []).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-card p-4 shadow-sm">
            <div className="text-xs uppercase text-muted">{k}</div>
            <div className="mt-2 text-lg font-semibold text-success">{fmt(v.monthlyRevenue)}/mo</div>
            <div className="text-xs text-muted">Annual {fmt(v.annualRevenue)}</div>
            <div className="mt-2 text-xs text-muted">
              Effective students {v.effectiveStudents.toLocaleString()} · Boys {v.boysCount} / Girls {v.girlsCount}
            </div>
            <div className="text-xs text-muted">
              Monthly split: {fmt(v.revenueBoys)} boys · {fmt(v.revenueGirls)} girls
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
        <label className="block text-xs text-muted">
          UDISE
          <input
            className="mt-1 w-full max-w-md rounded-md border border-line bg-card px-2 py-1 text-sm text-ink"
            value={udise}
            onChange={(e) => setUdise(e.target.value.replace(/\D/g, "").slice(0, 11))}
          />
        </label>
        <button
          type="button"
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
          onClick={() => customSchool.mutate()}
          disabled={udise.length !== 11}
        >
          Recalculate for school
        </button>
        {customSchool.data ? (
          <div className="mt-4 space-y-1 text-sm text-ink">
            <div>
              Monthly {fmt(customSchool.data.monthlyRevenue)} · Annual {fmt(customSchool.data.annualRevenue)}
            </div>
            <div className="text-xs text-muted">
              Effective students {customSchool.data.effectiveStudents.toLocaleString()} · Split {fmt(customSchool.data.revenueBoys)} /{" "}
              {fmt(customSchool.data.revenueGirls)} (boys / girls, monthly)
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
