import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiJson } from "../lib/api";
import type { RevenueProjectionResponse } from "../types/school-api";

const STORAGE_KEY = "jnv.revenue.presetInputs.v1";

const DEFAULT_PRESET_INPUTS = {
  LOW: { pricePerWash: 20, washesPerStudentPerMonth: 2, adoptionRate: 0.6 },
  MEDIUM: { pricePerWash: 30, washesPerStudentPerMonth: 4, adoptionRate: 0.85 },
  HIGH: { pricePerWash: 40, washesPerStudentPerMonth: 6, adoptionRate: 0.95 },
} as const;

type PresetKey = keyof typeof DEFAULT_PRESET_INPUTS;
type PresetInputs = Record<PresetKey, { pricePerWash: number; washesPerStudentPerMonth: number; adoptionRate: number }>;

const THEME: Record<PresetKey, { label: string; text: string; border: string; bg: string }> = {
  LOW: { label: "Low", text: "text-emerald-700", border: "border-emerald-200", bg: "bg-emerald-50" },
  MEDIUM: { label: "Medium", text: "text-yellow-700", border: "border-yellow-200", bg: "bg-yellow-50" },
  HIGH: { label: "High", text: "text-rose-800", border: "border-rose-200", bg: "bg-rose-50" },
};

function projectionBody(preset: PresetKey, presetInputs: PresetInputs, schoolPage: number, schoolPageSize: number) {
  return JSON.stringify({
    preset,
    presetOverrides: {
      LOW: presetInputs.LOW,
      MEDIUM: presetInputs.MEDIUM,
      HIGH: presetInputs.HIGH,
    },
    schoolPage,
    schoolPageSize,
  });
}

function fmtInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function readSavedPresetInputs(): PresetInputs {
  const fallback: PresetInputs = {
    LOW: { ...DEFAULT_PRESET_INPUTS.LOW },
    MEDIUM: { ...DEFAULT_PRESET_INPUTS.MEDIUM },
    HIGH: { ...DEFAULT_PRESET_INPUTS.HIGH },
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PresetInputs>;
    const safeNum = (v: unknown, def: number) =>
      typeof v === "number" && Number.isFinite(v) ? v : def;
    return {
      LOW: {
        pricePerWash: safeNum(parsed?.LOW?.pricePerWash, DEFAULT_PRESET_INPUTS.LOW.pricePerWash),
        washesPerStudentPerMonth: safeNum(
          parsed?.LOW?.washesPerStudentPerMonth,
          DEFAULT_PRESET_INPUTS.LOW.washesPerStudentPerMonth,
        ),
        adoptionRate: safeNum(parsed?.LOW?.adoptionRate, DEFAULT_PRESET_INPUTS.LOW.adoptionRate),
      },
      MEDIUM: {
        pricePerWash: safeNum(parsed?.MEDIUM?.pricePerWash, DEFAULT_PRESET_INPUTS.MEDIUM.pricePerWash),
        washesPerStudentPerMonth: safeNum(
          parsed?.MEDIUM?.washesPerStudentPerMonth,
          DEFAULT_PRESET_INPUTS.MEDIUM.washesPerStudentPerMonth,
        ),
        adoptionRate: safeNum(parsed?.MEDIUM?.adoptionRate, DEFAULT_PRESET_INPUTS.MEDIUM.adoptionRate),
      },
      HIGH: {
        pricePerWash: safeNum(parsed?.HIGH?.pricePerWash, DEFAULT_PRESET_INPUTS.HIGH.pricePerWash),
        washesPerStudentPerMonth: safeNum(
          parsed?.HIGH?.washesPerStudentPerMonth,
          DEFAULT_PRESET_INPUTS.HIGH.washesPerStudentPerMonth,
        ),
        adoptionRate: safeNum(parsed?.HIGH?.adoptionRate, DEFAULT_PRESET_INPUTS.HIGH.adoptionRate),
      },
    };
  } catch {
    return fallback;
  }
}

export function RevenuePage() {
  const [presetInputs, setPresetInputs] = useState<PresetInputs>(() => readSavedPresetInputs());
  const [saveNote, setSaveNote] = useState<string>("");
  const [schoolPage, setSchoolPage] = useState(1);
  const schoolPageSize = 25;

  const lowBody = useMemo(() => projectionBody("LOW", presetInputs, schoolPage, schoolPageSize), [presetInputs, schoolPage]);
  const mediumBody = useMemo(
    () => projectionBody("MEDIUM", presetInputs, schoolPage, schoolPageSize),
    [presetInputs, schoolPage],
  );
  const highBody = useMemo(() => projectionBody("HIGH", presetInputs, schoolPage, schoolPageSize), [presetInputs, schoolPage]);

  const lowQ = useQuery({
    queryKey: ["revenue-projection-low", lowBody],
    queryFn: () =>
      apiJson<RevenueProjectionResponse>("/api/revenue/projection", {
        method: "POST",
        body: lowBody,
      }),
  });
  const mediumQ = useQuery({
    queryKey: ["revenue-projection-medium", mediumBody],
    queryFn: () =>
      apiJson<RevenueProjectionResponse>("/api/revenue/projection", {
        method: "POST",
        body: mediumBody,
      }),
  });
  const highQ = useQuery({
    queryKey: ["revenue-projection-high", highBody],
    queryFn: () =>
      apiJson<RevenueProjectionResponse>("/api/revenue/projection", {
        method: "POST",
        body: highBody,
      }),
  });

  function updatePresetInput(
    preset: PresetKey,
    key: "pricePerWash" | "washesPerStudentPerMonth" | "adoptionRate",
    next: number,
  ) {
    setPresetInputs((prev) => ({
      ...prev,
      [preset]: { ...prev[preset], [key]: next },
    }));
    setSaveNote("Unsaved changes");
    setSchoolPage(1);
  }

  function resetDefaults() {
    setPresetInputs({
      LOW: { ...DEFAULT_PRESET_INPUTS.LOW },
      MEDIUM: { ...DEFAULT_PRESET_INPUTS.MEDIUM },
      HIGH: { ...DEFAULT_PRESET_INPUTS.HIGH },
    });
    setSaveNote("Defaults loaded (click Save values to persist)");
    setSchoolPage(1);
  }

  function savePresetValues() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presetInputs));
    setSaveNote("Saved. Your model values will stay after refresh.");
  }

  const loading = lowQ.isPending || mediumQ.isPending || highQ.isPending;
  const hasError = lowQ.isError || mediumQ.isError || highQ.isError;

  const byStateRows = useMemo(() => {
    const low = lowQ.data?.byState ?? [];
    const med = mediumQ.data?.byState ?? [];
    const high = highQ.data?.byState ?? [];
    const states = new Set<string>([...low.map((r) => r.state), ...med.map((r) => r.state), ...high.map((r) => r.state)]);
    return [...states]
      .map((state) => {
        const l = low.find((r) => r.state === state);
        const m = med.find((r) => r.state === state);
        const h = high.find((r) => r.state === state);
        return {
          state,
          schoolCount: m?.schoolCount ?? l?.schoolCount ?? h?.schoolCount ?? 0,
          totalStudents: m?.totalStudents ?? l?.totalStudents ?? h?.totalStudents ?? 0,
          lowMonthly: l?.monthlyRevenue ?? 0,
          lowAnnual: l?.annualRevenue ?? 0,
          medMonthly: m?.monthlyRevenue ?? 0,
          medAnnual: m?.annualRevenue ?? 0,
          highMonthly: h?.monthlyRevenue ?? 0,
          highAnnual: h?.annualRevenue ?? 0,
        };
      })
      .sort((a, b) => b.totalStudents - a.totalStudents || a.state.localeCompare(b.state));
  }, [lowQ.data?.byState, mediumQ.data?.byState, highQ.data?.byState]);

  const perSchoolRows = useMemo(() => {
    const low = lowQ.data?.schools ?? [];
    const med = mediumQ.data?.schools ?? [];
    const high = highQ.data?.schools ?? [];
    const map = new Map<
      string,
      {
        udise: string;
        schoolName: string;
        state: string;
        totalStudents: number;
        lowMonthly: number;
        lowAnnual: number;
        medMonthly: number;
        medAnnual: number;
        highMonthly: number;
        highAnnual: number;
      }
    >();
    for (const r of med) {
      map.set(r.udise, {
        udise: r.udise,
        schoolName: r.schoolName,
        state: r.state,
        totalStudents: r.totalStudents,
        lowMonthly: 0,
        lowAnnual: 0,
        medMonthly: r.monthlyRevenue,
        medAnnual: r.annualRevenue,
        highMonthly: 0,
        highAnnual: 0,
      });
    }
    for (const r of low) {
      const base = map.get(r.udise);
      if (base) {
        base.lowMonthly = r.monthlyRevenue;
        base.lowAnnual = r.annualRevenue;
      } else {
        map.set(r.udise, {
          udise: r.udise,
          schoolName: r.schoolName,
          state: r.state,
          totalStudents: r.totalStudents,
          lowMonthly: r.monthlyRevenue,
          lowAnnual: r.annualRevenue,
          medMonthly: 0,
          medAnnual: 0,
          highMonthly: 0,
          highAnnual: 0,
        });
      }
    }
    for (const r of high) {
      const base = map.get(r.udise);
      if (base) {
        base.highMonthly = r.monthlyRevenue;
        base.highAnnual = r.annualRevenue;
      } else {
        map.set(r.udise, {
          udise: r.udise,
          schoolName: r.schoolName,
          state: r.state,
          totalStudents: r.totalStudents,
          lowMonthly: 0,
          lowAnnual: 0,
          medMonthly: 0,
          medAnnual: 0,
          highMonthly: r.monthlyRevenue,
          highAnnual: r.annualRevenue,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.medMonthly - a.medMonthly || a.udise.localeCompare(b.udise));
  }, [lowQ.data?.schools, mediumQ.data?.schools, highQ.data?.schools]);

  const portfolio = {
    schoolCount: mediumQ.data?.portfolio.schoolCount ?? 0,
    totalStudents: mediumQ.data?.portfolio.totalStudents ?? 0,
    lowMonthly: lowQ.data?.portfolio.monthlyRevenue ?? 0,
    lowAnnual: lowQ.data?.portfolio.annualRevenue ?? 0,
    medMonthly: mediumQ.data?.portfolio.monthlyRevenue ?? 0,
    medAnnual: mediumQ.data?.portfolio.annualRevenue ?? 0,
    highMonthly: highQ.data?.portfolio.monthlyRevenue ?? 0,
    highAnnual: highQ.data?.portfolio.annualRevenue ?? 0,
  };
  const schoolsTotal = mediumQ.data?.schoolsTotal ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold premium-gradient-text">Revenue lab</h1>
        <p className="text-sm text-muted">
          Set your LOW / MEDIUM / HIGH models. Values persist after refresh until you reset. Annual values always use 9 months.
        </p>
      </div>

      <div className="premium-panel rounded-xl p-4 premium-ring">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs uppercase text-muted">Set model parameters</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-glow hover:bg-accent-hover"
              onClick={savePresetValues}
            >
              Save values
            </button>
            <button
              type="button"
              className="rounded-md border border-line bg-surface-3 px-3 py-1.5 text-xs text-ink hover:bg-surface-4"
              onClick={resetDefaults}
            >
              Reset to defaults
            </button>
          </div>
        </div>
        {saveNote ? <div className="mb-3 text-xs text-emerald-700">{saveNote}</div> : null}
        <div className="grid gap-3 md:grid-cols-3">
          {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => {
            const t = THEME[p];
            return (
              <div key={p} className={`rounded-lg border p-3 ${t.border} ${t.bg}`}>
                <div className={`text-xs font-semibold uppercase ${t.text}`}>{t.label}</div>
                <div className="mt-2 grid gap-2">
                  <label className="text-[11px] text-muted">
                    ₹ / wash
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="mt-1 w-full rounded-md border border-line bg-surface-3 px-2 py-1 text-sm text-ink"
                      value={presetInputs[p].pricePerWash}
                      onChange={(e) => updatePresetInput(p, "pricePerWash", Number(e.target.value))}
                    />
                  </label>
                  <label className="text-[11px] text-muted">
                    Washes / student / month
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="mt-1 w-full rounded-md border border-line bg-surface-3 px-2 py-1 text-sm text-ink"
                      value={presetInputs[p].washesPerStudentPerMonth}
                      onChange={(e) => updatePresetInput(p, "washesPerStudentPerMonth", Number(e.target.value))}
                    />
                  </label>
                  <label className="text-[11px] text-muted">
                    Adoption rate (0-1)
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      className="mt-1 w-full rounded-md border border-line bg-surface-3 px-2 py-1 text-sm text-ink"
                      value={presetInputs[p].adoptionRate}
                      onChange={(e) => updatePresetInput(p, "adoptionRate", Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hasError ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/15 p-3 text-sm text-amber-200">
          Could not load revenue projections.
        </div>
      ) : null}

      {loading ? (
        <div className="text-muted">Computing revenue models…</div>
      ) : (
        <>
          <div className="premium-panel rounded-xl p-4 premium-ring">
            <h2 className="text-sm font-semibold text-ink">Total portfolio</h2>
            <p className="mt-1 text-xs text-muted">
              {portfolio.schoolCount} schools · {portfolio.totalStudents.toLocaleString()} students
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => {
                const t = THEME[p];
                const monthly = p === "LOW" ? portfolio.lowMonthly : p === "MEDIUM" ? portfolio.medMonthly : portfolio.highMonthly;
                const annual = p === "LOW" ? portfolio.lowAnnual : p === "MEDIUM" ? portfolio.medAnnual : portfolio.highAnnual;
                return (
                  <div key={p} className={`rounded-lg border p-3 ${t.border} ${t.bg}`}>
                    <div className={`text-xs uppercase ${t.text}`}>{t.label}</div>
                    <div className={`mt-2 text-lg font-semibold ${t.text}`}>{fmtInr(monthly)} / mo</div>
                    <div className="text-xs text-muted">Annual {fmtInr(annual)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="premium-panel rounded-xl p-4 premium-ring">
            <h2 className="text-sm font-semibold text-ink">By state</h2>
            <div className="mt-2 max-h-72 overflow-auto text-sm">
              <table className="w-full min-w-[980px] text-left text-ink">
                <thead className="sticky top-0 bg-card text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2">State</th>
                    <th className="py-1 pr-2">Schools</th>
                    <th className="py-1 pr-2">Students</th>
                    <th className="py-1 pr-2 text-emerald-700">Low/mo</th>
                    <th className="py-1 pr-2 text-emerald-700">Low/yr</th>
                    <th className="py-1 pr-2 text-yellow-700">Medium/mo</th>
                    <th className="py-1 pr-2 text-yellow-700">Medium/yr</th>
                    <th className="py-1 pr-2 text-rose-800">High/mo</th>
                    <th className="py-1 text-rose-800">High/yr</th>
                  </tr>
                </thead>
                <tbody>
                  {byStateRows.map((r) => (
                    <tr key={r.state} className="border-t border-line">
                      <td className="py-1.5 pr-2">{r.state}</td>
                      <td className="py-1.5 pr-2 text-muted">{r.schoolCount}</td>
                      <td className="py-1.5 pr-2 text-muted">{r.totalStudents.toLocaleString()}</td>
                      <td className="py-1.5 pr-2 text-emerald-700">{fmtInr(r.lowMonthly)}</td>
                      <td className="py-1.5 pr-2 text-muted">{fmtInr(r.lowAnnual)}</td>
                      <td className="py-1.5 pr-2 text-yellow-700">{fmtInr(r.medMonthly)}</td>
                      <td className="py-1.5 pr-2 text-muted">{fmtInr(r.medAnnual)}</td>
                      <td className="py-1.5 pr-2 text-rose-800">{fmtInr(r.highMonthly)}</td>
                      <td className="py-1.5 text-muted">{fmtInr(r.highAnnual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="premium-panel rounded-xl p-4 premium-ring">
            <h2 className="text-sm font-semibold text-ink">Per school</h2>
            <p className="text-xs text-muted">
              Page {schoolPage} of {Math.max(1, Math.ceil(schoolsTotal / schoolPageSize))} · {schoolsTotal} schools
            </p>
            <div className="mt-2 max-h-96 overflow-auto text-sm">
              <table className="w-full min-w-[1200px] text-left text-ink">
                <thead className="sticky top-0 bg-card text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2">School</th>
                    <th className="py-1 pr-2">State</th>
                    <th className="py-1 pr-2">Students</th>
                    <th className="py-1 pr-2 text-emerald-700">Low/mo</th>
                    <th className="py-1 pr-2 text-emerald-700">Low/yr</th>
                    <th className="py-1 pr-2 text-yellow-700">Medium/mo</th>
                    <th className="py-1 pr-2 text-yellow-700">Medium/yr</th>
                    <th className="py-1 pr-2 text-rose-800">High/mo</th>
                    <th className="py-1 text-rose-800">High/yr</th>
                  </tr>
                </thead>
                <tbody>
                  {perSchoolRows.map((s) => (
                    <tr key={s.udise} className="border-t border-line">
                      <td className="py-1.5 pr-2">
                        <div className="font-medium text-ink">{s.schoolName}</div>
                        <div className="font-mono text-[11px] text-muted">{s.udise}</div>
                      </td>
                      <td className="py-1.5 pr-2 text-muted">{s.state}</td>
                      <td className="py-1.5 pr-2">{s.totalStudents.toLocaleString()}</td>
                      <td className="py-1.5 pr-2 text-emerald-700">{fmtInr(s.lowMonthly)}</td>
                      <td className="py-1.5 pr-2 text-muted">{fmtInr(s.lowAnnual)}</td>
                      <td className="py-1.5 pr-2 text-yellow-700">{fmtInr(s.medMonthly)}</td>
                      <td className="py-1.5 pr-2 text-muted">{fmtInr(s.medAnnual)}</td>
                      <td className="py-1.5 pr-2 text-rose-800">{fmtInr(s.highMonthly)}</td>
                      <td className="py-1.5 text-muted">{fmtInr(s.highAnnual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-md border border-line bg-surface-3 px-3 py-1 text-sm text-ink disabled:opacity-40"
                disabled={schoolPage <= 1}
                onClick={() => setSchoolPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-md border border-line bg-surface-3 px-3 py-1 text-sm text-ink disabled:opacity-40"
                disabled={schoolPage * schoolPageSize >= schoolsTotal}
                onClick={() => setSchoolPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
