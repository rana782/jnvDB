import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { createSearchParams, useSearchParams } from "react-router-dom";
import { PipelineBadge } from "../components/PipelineBadge";
import { apiJson } from "../lib/api";
import { PIPELINE_STATUS_ORDER } from "../lib/pipeline-status";
import type { CompareSchoolRow, CompareSchoolsResponse } from "../types/school-api";

const PIPELINE_RANK: Record<string, number> = Object.fromEntries(
  PIPELINE_STATUS_ORDER.map((s, i) => [s, i]),
);

const PARSING_RANK: Record<string, number> = {
  FAILED: 0,
  PENDING: 1,
  PARTIAL: 2,
  COMPLETE: 3,
};

const BEST_CELL =
  "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.15)]";

function fetchCompare(udises: string[]): Promise<CompareSchoolsResponse> {
  const qs = new URLSearchParams();
  for (const u of udises) qs.append("u", u);
  return apiJson<CompareSchoolsResponse>(`/api/schools/compare?${qs.toString()}`);
}

function customRevenue(s: CompareSchoolRow): { monthly: number; annual: number } {
  const c = s.revenueScenarios?.find((r) => r.kind === "CUSTOM");
  return {
    monthly: typeof c?.monthlyRevenue === "number" ? c.monthlyRevenue : NaN,
    annual: typeof c?.annualRevenue === "number" ? c.annualRevenue : NaN,
  };
}

function bestMaxIndices(values: (number | null | undefined)[]): Set<number> {
  const nums = values.map((v, i) => ({
    i,
    n: v != null && Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY,
  }));
  const m = Math.max(...nums.map((x) => x.n));
  if (!Number.isFinite(m) || m === Number.NEGATIVE_INFINITY) return new Set();
  return new Set(nums.filter((x) => x.n === m).map((x) => x.i));
}

function bestMinIndices(values: (number | null | undefined)[]): Set<number> {
  const nums = values.map((v, i) => ({
    i,
    n: v != null && Number.isFinite(v) ? v : Number.POSITIVE_INFINITY,
  }));
  const m = Math.min(...nums.map((x) => x.n));
  if (!Number.isFinite(m) || m === Number.POSITIVE_INFINITY) return new Set();
  return new Set(nums.filter((x) => x.n === m).map((x) => x.i));
}

/** Highest rank wins (e.g. pipeline DONE). */
function bestRankIndices(values: string[], rankMap: Record<string, number>): Set<number> {
  const ranks = values.map((v, i) => ({
    i,
    r: rankMap[v] ?? -1,
  }));
  const m = Math.max(...ranks.map((x) => x.r));
  if (m < 0) return new Set();
  return new Set(ranks.filter((x) => x.r === m).map((x) => x.i));
}

/** For booleans: highlight all `true` if any school is true. */
function bestTrueIndices(values: (boolean | null | undefined)[]): Set<number> {
  if (!values.some((v) => v === true)) return new Set();
  return new Set(values.map((v, i) => (v === true ? i : -1)).filter((i) => i >= 0));
}

function fmtNum(n: number | null | undefined, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString()}${suffix}`;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `₹${Math.round(n).toLocaleString()}`;
}

function boolLabel(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

type RowDef = {
  label: string;
  cells: ReactNode[];
};

function CompareTable({ schools }: { schools: CompareSchoolRow[] }) {
  const n = schools.length;
  const infra = (s: CompareSchoolRow) => s.sections?.infra;
  const digital = (s: CompareSchoolRow) => s.sections?.digital;

  const rows = useMemo((): { section: string; rows: RowDef[] }[] => {
    const out: { section: string; rows: RowDef[] }[] = [];

    const pushNumeric = (
      section: string,
      label: string,
      vals: (number | null | undefined)[],
      mode: "max" | "min",
      format: (v: number | null | undefined, i: number) => ReactNode,
    ) => {
      const best = mode === "max" ? bestMaxIndices(vals) : bestMinIndices(vals);
      const cells = vals.map((v, i) => (
        <span key={i} className={best.has(i) ? `rounded px-1.5 py-0.5 ${BEST_CELL}` : ""}>
          {format(v, i)}
        </span>
      ));
      const sec = out.find((o) => o.section === section);
      const row: RowDef = { label, cells };
      if (sec) sec.rows.push(row);
      else out.push({ section, rows: [row] });
    };

    const pushBool = (
      section: string,
      label: string,
      vals: (boolean | null | undefined)[],
    ) => {
      const best = bestTrueIndices(vals);
      const cells = vals.map((v, i) => (
        <span key={i} className={best.has(i) ? `rounded px-1.5 py-0.5 ${BEST_CELL}` : ""}>
          {boolLabel(v)}
        </span>
      ));
      const sec = out.find((o) => o.section === section);
      const row: RowDef = { label, cells };
      if (sec) sec.rows.push(row);
      else out.push({ section, rows: [row] });
    };

    // --- Students ---
    pushNumeric(
      "Students",
      "Total students",
      schools.map((s) => s.enrolmentHeadcount.totalStudents),
      "max",
      (v) => fmtNum(v),
    );
    pushNumeric(
      "Students",
      "Boys",
      schools.map((s) => s.enrolmentHeadcount.totalBoys),
      "max",
      (v) => fmtNum(v),
    );
    pushNumeric(
      "Students",
      "Girls",
      schools.map((s) => s.enrolmentHeadcount.totalGirls),
      "max",
      (v) => fmtNum(v),
    );
    pushNumeric(
      "Students",
      "Teachers",
      schools.map((s) => s.enrolmentHeadcount.totalTeachers),
      "max",
      (v) => fmtNum(v),
    );

    // --- Core infra (school flags) ---
    const facKeys: { key: string; label: string }[] = [
      { key: "waterAvailable", label: "Water" },
      { key: "electricityAvailable", label: "Electricity" },
      { key: "internetAvailable", label: "Internet" },
      { key: "solarAvailable", label: "Solar" },
      { key: "playgroundAvailable", label: "Playground" },
      { key: "libraryAvailable", label: "Library" },
    ];
    for (const { key, label } of facKeys) {
      pushBool(
        "Infra (facilities)",
        label,
        schools.map((s) => s.facilities?.[key] as boolean | null | undefined),
      );
    }

    pushBool(
      "Infra (detail)",
      "Pucca building",
      schools.map((s) => infra(s)?.puccaBuilding),
    );
    pushNumeric(
      "Infra (detail)",
      "Functional toilets (B)",
      schools.map((s) => infra(s)?.functionalToiletsB ?? null),
      "max",
      (v) => fmtNum(v),
    );
    pushNumeric(
      "Infra (detail)",
      "Functional toilets (G)",
      schools.map((s) => infra(s)?.functionalToiletsG ?? null),
      "max",
      (v) => fmtNum(v),
    );
    pushBool(
      "Infra (detail)",
      "Ramps",
      schools.map((s) => infra(s)?.rampsAvailable),
    );
    pushBool(
      "Infra (detail)",
      "Medical checkup",
      schools.map((s) => infra(s)?.medicalCheckup),
    );

    pushNumeric(
      "Digital",
      "Smart class TV",
      schools.map((s) => digital(s)?.smartClassTv ?? null),
      "max",
      (v) => fmtNum(v),
    );
    pushNumeric(
      "Digital",
      "Laptops",
      schools.map((s) => digital(s)?.laptops ?? null),
      "max",
      (v) => fmtNum(v),
    );
    pushNumeric(
      "Digital",
      "Desktops",
      schools.map((s) => digital(s)?.desktops ?? null),
      "max",
      (v) => fmtNum(v),
    );
    pushNumeric(
      "Digital",
      "Tablets",
      schools.map((s) => digital(s)?.tablets ?? null),
      "max",
      (v) => fmtNum(v),
    );
    pushNumeric(
      "Digital",
      "Printers",
      schools.map((s) => digital(s)?.printers ?? null),
      "max",
      (v) => fmtNum(v),
    );
    pushNumeric(
      "Digital",
      "Total devices",
      schools.map((s) => {
        const d = digital(s);
        if (!d) return null;
        const parts = [d.smartClassTv, d.laptops, d.desktops, d.tablets, d.printers];
        if (parts.every((x) => x == null)) return null;
        return parts.reduce<number>(
          (sum, x) => sum + (typeof x === "number" && Number.isFinite(x) ? x : 0),
          0,
        );
      }),
      "max",
      (v) => fmtNum(v),
    );

    // --- Readiness ---
    pushNumeric(
      "Readiness",
      "Profile completeness %",
      schools.map((s) => s.profileCompletenessPct),
      "max",
      (v) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v)}%`),
    );
    pushNumeric(
      "Readiness",
      "Extraction confidence %",
      schools.map((s) =>
        s.provenance.overallExtractionConfidence != null
          ? s.provenance.overallExtractionConfidence * 100
          : null,
      ),
      "max",
      (v) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v)}%`),
    );
    pushBool(
      "Readiness",
      "Pilot suitable",
      schools.map((s) => s.pilotSuitable),
    );

    // --- Revenue (CUSTOM stored scenario) ---
    const monthly = schools.map((s) => customRevenue(s).monthly);
    const annual = schools.map((s) => customRevenue(s).annual);
    const bestM = bestMaxIndices(monthly);
    const bestA = bestMaxIndices(annual);
    out.push({
      section: "Revenue (CUSTOM scenario)",
      rows: [
        {
          label: "Monthly",
          cells: monthly.map((v, i) => (
            <span key={i} className={bestM.has(i) ? `rounded px-1.5 py-0.5 ${BEST_CELL}` : ""}>
              {fmtMoney(v)}
            </span>
          )),
        },
        {
          label: "Annual",
          cells: annual.map((v, i) => (
            <span key={i} className={bestA.has(i) ? `rounded px-1.5 py-0.5 ${BEST_CELL}` : ""}>
              {fmtMoney(v)}
            </span>
          )),
        },
      ],
    });

    // --- Completion ---
    const parseStatuses = schools.map((s) => s.provenance.parsingStatus ?? "");
    const bestParse = bestRankIndices(parseStatuses, PARSING_RANK);
    const bestPipeline = bestRankIndices(
      schools.map((s) => s.pipelineStatus),
      PIPELINE_RANK,
    );
    out.push({
      section: "Completion",
      rows: [
        {
          label: "Pipeline status",
          cells: schools.map((s, i) => (
            <span
              key={s.udise}
              className={bestPipeline.has(i) ? `inline-flex rounded px-1 py-0.5 ${BEST_CELL}` : ""}
            >
              <PipelineBadge status={s.pipelineStatus} />
            </span>
          )),
        },
        {
          label: "Parsing status",
          cells: parseStatuses.map((v, i) => (
            <span key={i} className={bestParse.has(i) ? `rounded px-1.5 py-0.5 ${BEST_CELL}` : ""}>
              {v || "—"}
            </span>
          )),
        },
      ],
    });

    return out;
  }, [schools]);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card shadow-sm">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas text-left">
            <th className="sticky left-0 z-20 min-w-[10rem] bg-canvas px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Metric
            </th>
            {schools.map((s) => (
              <th key={s.udise} className="px-3 py-3 align-bottom">
                <div className="font-mono text-xs text-accent">{s.udise}</div>
                <div className="mt-1 max-w-[11rem] font-semibold leading-snug text-ink">
                  {s.profile.schoolName}
                </div>
                <div className="mt-1 text-xs font-normal text-muted">
                  {s.location.geographicState ?? "—"} · {s.location.geographicDistrict ?? "—"}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((block) => (
            <Fragment key={block.section}>
              <tr className="bg-line/60">
                <td
                  colSpan={n + 1}
                  className="sticky left-0 z-10 bg-line/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink"
                >
                  {block.section}
                </td>
              </tr>
              {block.rows.map((r) => (
                <tr key={`${block.section}-${r.label}`} className="border-t border-line">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2.5 text-muted">{r.label}</td>
                  {r.cells.map((cell, i) => (
                    <td key={i} className="px-3 py-2.5 text-ink">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line bg-canvas px-3 py-2 text-xs text-muted">
        Highlighted cells are &quot;best&quot; in the row: higher counts and percentages, more advanced pipeline /
        parsing status, and facility flags when true. Revenue uses the stored CUSTOM scenario per school.
      </p>
    </div>
  );
}

export function ComparePage() {
  const [params, setParams] = useSearchParams();
  const [draftUdise, setDraftUdise] = useState("");

  const udises = useMemo(() => {
    const raw = params.getAll("u");
    const flat = raw.flatMap((s) => s.split(",").map((x) => x.trim()).filter(Boolean));
    const valid = flat.filter((u) => /^\d{11}$/.test(u));
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const u of valid) {
      if (seen.has(u)) continue;
      seen.add(u);
      uniq.push(u);
      if (uniq.length >= 4) break;
    }
    return uniq.length >= 2 ? uniq : [];
  }, [params]);

  const setUdises = (next: string[]) => {
    const q = createSearchParams();
    for (const u of next.slice(0, 4)) q.append("u", u);
    setParams(q, { replace: true });
  };

  const q = useQuery({
    queryKey: ["compare", udises.join(",")],
    queryFn: () => fetchCompare(udises),
    enabled: udises.length >= 2,
  });

  function addFromInput() {
    const u = draftUdise.replace(/\D/g, "").slice(0, 11);
    if (!/^\d{11}$/.test(u)) return;
    const next = [...udises];
    if (next.includes(u)) {
      setDraftUdise("");
      return;
    }
    if (next.length >= 4) return;
    next.push(u);
    setDraftUdise("");
    setUdises(next);
  }

  function removeUdise(u: string) {
    setUdises(udises.filter((x) => x !== u));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Compare schools</h1>
        <p className="text-sm text-muted">
          Select 2–4 schools. Use the URL (<code className="rounded bg-canvas px-1 py-0.5 font-mono text-accent">?u=</code> repeated) or add UDISE codes
          below. Side-by-side metrics; best values per row are highlighted.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4 shadow-sm">
        <label className="text-xs text-muted">
          Add UDISE (11 digits)
          <input
            className="mt-1 block w-44 rounded-md border border-line bg-card px-2 py-1.5 font-mono text-sm text-ink placeholder:text-muted"
            value={draftUdise}
            onChange={(e) => setDraftUdise(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="27200100101"
            maxLength={11}
          />
        </label>
        <button
          type="button"
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover disabled:opacity-40"
          disabled={draftUdise.length !== 11 || udises.length >= 4 || udises.includes(draftUdise)}
          onClick={addFromInput}
        >
          Add
        </button>
        <button
          type="button"
          className="rounded-md border border-line px-3 py-2 text-sm text-ink transition-colors duration-100 hover:bg-canvas"
          onClick={() => {
            setUdises([]);
            setDraftUdise("");
          }}
        >
          Clear all
        </button>
        <span className="text-xs text-muted">
          {udises.length} / 4 selected · minimum 2 to load
        </span>
      </div>

      {udises.length > 0 && udises.length < 2 ? (
        <p className="text-sm text-warning">Add at least one more school to compare.</p>
      ) : null}

      {udises.length >= 2 ? (
        <div className="flex flex-wrap gap-2">
          {udises.map((u) => (
            <span
              key={u}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 font-mono text-xs text-accent"
            >
              {u}
              <button
                type="button"
                className="text-muted transition-colors duration-100 hover:text-warning"
                title="Remove from compare"
                onClick={() => removeUdise(u)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {q.isError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Could not load comparison from the API.
        </div>
      ) : null}
      {q.isPending && udises.length >= 2 ? <div className="text-muted">Loading…</div> : null}
      {q.data?.schools?.length ? <CompareTable schools={q.data.schools} /> : null}
    </div>
  );
}
