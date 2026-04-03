import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import CountUp from "react-countup";
import { Link, useParams } from "react-router-dom";
import { fast, normal, staggerContainer, staggerItem } from "../lib/animationConfig";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiJson, apiPatchJson } from "../lib/api";
import { PipelineBadge } from "../components/PipelineBadge";
import { PIPELINE_STATUS_ORDER, pipelineStatusLabel } from "../lib/pipeline-status";
import { useShellOutlet } from "../layout/ShellContext";
import type { EnrolmentAgeChartRow, EnrolmentCategoryChartRow, SchoolDetailResponse } from "../types/school-api";

async function fetchSchool(udise: string): Promise<SchoolDetailResponse> {
  return apiJson<SchoolDetailResponse>(`/api/schools/${udise}`);
}

const PALETTE = [
  "#2563EB",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
  "#059669",
  "#6366F1",
] as const;

const CHART_AXIS = { stroke: "#CBD5E1", tick: { fill: "#64748B", fontSize: 11 } };
const TOOLTIP_STYLE = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: "8px",
  color: "#0F172A",
  boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
};
const LEGEND_STYLE = { color: "#64748B", fontSize: "12px", paddingTop: "8px" };

function socialCategorySlots(rows: EnrolmentCategoryChartRow[]): {
  label: "SC" | "ST" | "OBC" | "General";
  value: number | null;
}[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const entries = new Map<string, EnrolmentCategoryChartRow>();
  for (const r of rows ?? []) {
    if (r?.category) entries.set(norm(r.category), r);
  }
  const get = (aliases: string[]): number | null => {
    for (const a of aliases) {
      const r = entries.get(norm(a));
      if (!r) continue;
      const cv = r.chartValue;
      if (typeof cv === "number" && Number.isFinite(cv) && cv > 0) return cv;
      if (r.total != null && typeof r.total === "number" && Number.isFinite(r.total)) return r.total;
      const sum = (r.boys ?? 0) + (r.girls ?? 0);
      if (sum > 0) return sum;
    }
    return null;
  };
  return [
    { label: "SC", value: get(["sc", "scheduled caste"]) },
    { label: "ST", value: get(["st", "scheduled tribe"]) },
    { label: "OBC", value: get(["obc", "other backward class"]) },
    { label: "General", value: get(["general", "gen"]) },
  ];
}

function ChartEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-line bg-canvas px-4 text-center">
      <p className="text-sm font-medium text-muted">{title}</p>
      <p className="mt-2 max-w-xs text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function rowCategoryChartMag(r: EnrolmentCategoryChartRow): number {
  if (typeof r.chartValue === "number" && Number.isFinite(r.chartValue)) return r.chartValue;
  if (typeof r.total === "number" && Number.isFinite(r.total)) return r.total;
  const b = typeof r.boys === "number" && Number.isFinite(r.boys) ? r.boys : 0;
  const g = typeof r.girls === "number" && Number.isFinite(r.girls) ? r.girls : 0;
  return b + g;
}

function toPieSlices(
  rows: EnrolmentCategoryChartRow[] | undefined,
  options?: { excludeTotal?: boolean },
): { name: string; value: number }[] {
  const list = Array.isArray(rows) ? rows : [];
  const exTotal = options?.excludeTotal !== false;
  return list
    .filter((r) => rowCategoryChartMag(r) > 0)
    .filter((r) => !exTotal || String(r.category ?? "").trim().toLowerCase() !== "total")
    .map((r) => ({
      name: (r.category ?? "").trim() || "—",
      value: rowCategoryChartMag(r),
    }));
}

function rowAgeChartMag(r: EnrolmentAgeChartRow): number {
  if (typeof r.chartValue === "number" && Number.isFinite(r.chartValue)) return r.chartValue;
  if (typeof r.total === "number" && Number.isFinite(r.total)) return r.total;
  const b = typeof r.boys === "number" && Number.isFinite(r.boys) ? r.boys : 0;
  const g = typeof r.girls === "number" && Number.isFinite(r.girls) ? r.girls : 0;
  return b + g;
}

function toAgeLinePoints(rows: EnrolmentAgeChartRow[] | undefined): { age: string; students: number }[] {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((r) => rowAgeChartMag(r) > 0)
    .filter((r) => String(r.ageBand ?? "").trim().toLowerCase() !== "total")
    .map((r) => ({
      age: (r.ageBand ?? "").trim() || "—",
      students: rowAgeChartMag(r),
    }))
    .sort((a, b) => (parseInt(a.age, 10) || 0) - (parseInt(b.age, 10) || 0));
}

function findCategoryTotalRow(rows: EnrolmentCategoryChartRow[]): EnrolmentCategoryChartRow | undefined {
  return rows.find((r) => String(r.category ?? "").trim().toLowerCase() === "total");
}

type RevRow = { kind?: string; monthlyRevenue?: number | null; annualRevenue?: number | null };

function coerceMoney(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickRevenueByKind(school: { revenueScenarios?: unknown }, kind: "LOW" | "MEDIUM" | "HIGH"): RevRow | undefined {
  const rows = school.revenueScenarios;
  if (!Array.isArray(rows)) return undefined;
  const raw = rows.find((r): r is RevRow => {
    if (typeof r !== "object" || r == null) return false;
    return String((r as RevRow).kind ?? "").toUpperCase() === kind;
  }) as RevRow | undefined;
  if (!raw) return undefined;
  return {
    kind,
    monthlyRevenue: coerceMoney(raw.monthlyRevenue),
    annualRevenue: coerceMoney(raw.annualRevenue),
  };
}

export function SchoolDetailPage() {
  const { udise: udiseRaw = "" } = useParams();
  const udise = udiseRaw.trim();
  const { setBreadcrumb } = useShellOutlet();
  const q = useQuery({ queryKey: ["school", udise], queryFn: () => fetchSchool(udise), enabled: udise.length > 0 });
  const [nextPipeline, setNextPipeline] = useState("NOT_REVIEWED");

  useEffect(() => {
    const st = q.data?.school.pipelineStatus;
    if (typeof st === "string" && st.length > 0) setNextPipeline(st);
  }, [q.data?.school.pipelineStatus]);

  useEffect(() => {
    if (!q.data) return;
    const name = q.data.school.profile?.schoolName ?? udise;
    setBreadcrumb(<span className="text-sm font-medium text-ink">{name}</span>);
    return () => setBreadcrumb(null);
  }, [q.data, udise, setBreadcrumb]);

  const statusMut = useMutation({
    mutationFn: async () => {
      await apiPatchJson(`/api/schools/${udise}/status`, { pipelineStatus: nextPipeline });
    },
    onSuccess: () => q.refetch(),
  });

  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : String(q.error ?? "");
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/15 p-4 text-sm text-ink">
        <p className="font-medium text-danger">Could not load this school.</p>
        <p className="mt-2 text-muted">
          {msg || "Unknown error."} Is the API running on port 4000? From <code className="rounded bg-canvas px-1">jnv-platform</code> run{" "}
          <code className="rounded bg-canvas px-1">npm run dev</code> (starts API + web together).
        </p>
      </div>
    );
  }

  if (q.isPending) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse rounded-xl border border-line bg-card p-6 shadow-sm">
          <div className="h-8 w-2/3 max-w-md rounded bg-slate-200" />
          <div className="mt-4 grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl border border-line bg-card" />
          ))}
        </div>
      </div>
    );
  }

  const {
    school: s,
    enrolmentSocial = [],
    enrolmentMinority = [],
    enrolmentOthers = [],
    enrolmentAge = [],
  } = q.data;

  const lowRev = pickRevenueByKind(s, "LOW");
  const mediumRev = pickRevenueByKind(s, "MEDIUM");
  const highRev = pickRevenueByKind(s, "HIGH");
  const slots = socialCategorySlots(enrolmentSocial);
  const socialTotalRow = findCategoryTotalRow(enrolmentSocial);
  const socialTotalMag = socialTotalRow ? rowCategoryChartMag(socialTotalRow) : 0;
  const hasSlotSocial = slots.some((x) => x.value != null && x.value > 0);
  /** Bulk Excel / snapshots often store only a "Total" row for social — still show one chart slice. */
  const hasSocialData = hasSlotSocial || socialTotalMag > 0;
  const socialPieData = hasSlotSocial
    ? slots
        .filter((x) => x.value != null && x.value > 0)
        .map((x) => ({ name: x.label, value: x.value as number }))
    : socialTotalMag > 0
      ? [{ name: "Enrolment (reported total)", value: socialTotalMag }]
      : [];
  const socialBarData = socialPieData.map((d) => ({ name: d.name, students: d.value }));

  const minorityPieRaw = toPieSlices(enrolmentMinority, { excludeTotal: true });
  const minorityTotalRow = findCategoryTotalRow(enrolmentMinority);
  const minorityTotalMag = minorityTotalRow ? rowCategoryChartMag(minorityTotalRow) : 0;
  const minorityPie =
    minorityPieRaw.length > 0
      ? minorityPieRaw
      : minorityTotalMag > 0
        ? [{ name: "Minority (reported total)", value: minorityTotalMag }]
        : [];

  const othersBarRaw = toPieSlices(enrolmentOthers, { excludeTotal: true });
  const othersTotalRow = findCategoryTotalRow(enrolmentOthers);
  const othersTotalMag = othersTotalRow ? rowCategoryChartMag(othersTotalRow) : 0;
  const othersBar =
    othersBarRaw.length > 0
      ? othersBarRaw
      : othersTotalMag > 0
        ? [{ name: "Other categories (total)", value: othersTotalMag }]
        : [];

  const ageLine = toAgeLinePoints(enrolmentAge);
  const ageTotalRow = enrolmentAge.find((r) => String(r.ageBand ?? "").trim().toLowerCase() === "total");
  const ageTotalMag = ageTotalRow ? rowAgeChartMag(ageTotalRow) : 0;
  const headcountTotal = s.enrolmentHeadcount?.totalStudents;
  const ageFallbackTotal =
    ageLine.length === 0
      ? typeof headcountTotal === "number" && headcountTotal > 0
        ? headcountTotal
        : ageTotalMag > 0
          ? ageTotalMag
          : null
      : null;

  const fetching = q.isFetching ? "opacity-[0.92]" : "";
  const infraStatus = [
    { key: "waterAvailable", label: "Water", ok: s.facilities?.waterAvailable === true },
    { key: "electricityAvailable", label: "Electricity", ok: s.facilities?.electricityAvailable === true },
    { key: "internetAvailable", label: "Internet", ok: s.facilities?.internetAvailable === true },
    { key: "solarAvailable", label: "Solar", ok: s.facilities?.solarAvailable === true },
    { key: "playgroundAvailable", label: "Playground", ok: s.facilities?.playgroundAvailable === true },
    { key: "libraryAvailable", label: "Library", ok: s.facilities?.libraryAvailable === true },
  ] as const;
  const infraAvailable = infraStatus.reduce((a, f) => a + (f.ok ? 1 : 0), 0);
  const infraPie = [
    { name: "Available", value: infraAvailable, color: "#16a34a" },
    { name: "Gap", value: Math.max(0, infraStatus.length - infraAvailable), color: "#e2e8f0" },
  ];
  const digitalRows = [
    { label: "Smart class TV", count: s.sections?.digital?.smartClassTv ?? 0 },
    { label: "Desktops", count: s.sections?.digital?.desktops ?? 0 },
    { label: "Laptops", count: s.sections?.digital?.laptops ?? 0 },
    { label: "Tablets", count: s.sections?.digital?.tablets ?? 0 },
    { label: "Printers", count: s.sections?.digital?.printers ?? 0 },
    { label: "Projectors", count: s.sections?.digital?.projectors ?? 0 },
  ];
  const digitalFunctional = digitalRows.filter((d) => d.count > 0).length;
  const digitalTotalUnits = digitalRows.reduce((a, d) => a + d.count, 0);
  const dist = s.location?.geographicDistrict;
  const headerTitle = dist ? `${s.profile?.schoolName ?? "—"} (${dist})` : (s.profile?.schoolName ?? "—");

  return (
    <div className={`mx-auto max-w-7xl space-y-6 ${fetching}`}>
      <header className="premium-panel rounded-xl p-6 premium-ring">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">School</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight premium-gradient-text">{headerTitle}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="font-mono text-accent">UDISE {s.udise}</span>
              <span>{s.location?.geographicState ?? "—"}</span>
              <span>{s.location?.geographicDistrict ?? "—"}</span>
              <span className="flex items-center gap-2">
                <PipelineBadge status={s.pipelineStatus} />
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <motion.a
              href="#pipeline"
              className="inline-block rounded-lg border border-line bg-surface-3 px-3 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:border-accent/40 hover:bg-surface-4"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={fast}
            >
              Mark status
            </motion.a>
          </div>
        </div>

        <motion.div
          className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <MetricCard label="Students" value={s.enrolmentHeadcount?.totalStudents} />
          <MetricCard label="Boys" value={s.enrolmentHeadcount?.totalBoys} />
          <MetricCard label="Girls" value={s.enrolmentHeadcount?.totalGirls} />
          <MetricCard label="Infra score" value={`${infraAvailable}/${infraStatus.length}`} />
        </motion.div>
        {s.provenance?.importLastError ? (
          <p className="mt-4 text-xs text-amber-800">Data load note: {s.provenance.importLastError}</p>
        ) : null}
      </header>

      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <ChartCard title="Social category" subtitle="SC, ST, OBC, General">
          {!hasSocialData ? (
            <ChartEmpty
              title="No social-category data"
              hint="Re-run the master Excel import for this UDISE or check the enrolment_social sheet has rows."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-[220px] min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 8, right: 8, bottom: 16, left: 8 }}>
                    <Pie
                      data={socialPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={80}
                      paddingAngle={2}
                      animationDuration={300}
                    >
                      {socialPieData.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number | string) => [v ?? 0, "Students"]} />
                    <Legend
                      layout="horizontal"
                      align="center"
                      verticalAlign="bottom"
                      wrapperStyle={{ ...LEGEND_STYLE, paddingTop: "12px" }}
                      formatter={(value) => <span className="text-ink">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[220px] min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={socialBarData} margin={{ top: 16, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="#E2E8F0" />
                    <XAxis dataKey="name" {...CHART_AXIS} />
                    <YAxis {...CHART_AXIS} allowDecimals={false} width={36} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number | string) => [v ?? 0, "Students"]} />
                    <Bar dataKey="students" radius={[4, 4, 0, 0]} maxBarSize={48} animationDuration={300}>
                      {socialBarData.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Minority" subtitle="Composition (Total excluded)">
          <div className="h-[260px]">
            {minorityPie.length === 0 ? (
              <ChartEmpty title="No minority breakdown" hint="Add rows for this school in the enrolment_minority sheet, then re-import." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                  <Pie
                    data={minorityPie}
                    dataKey="value"
                    nameKey="name"
                    cx="45%"
                    cy="50%"
                    outerRadius={88}
                    paddingAngle={1}
                    animationDuration={300}
                  >
                    {minorityPie.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number | string) => [v ?? 0, "Students"]} />
                  <Legend
                    layout="horizontal"
                    align="center"
                    verticalAlign="bottom"
                    wrapperStyle={{ ...LEGEND_STYLE, paddingTop: "16px" }}
                    formatter={(value) => <span className="text-ink">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Age distribution" subtitle="By age band">
          <div className="h-[260px]">
            {ageLine.length === 0 && ageFallbackTotal == null ? (
              <ChartEmpty title="No age-band data" hint="Populate the enrolment_age sheet for this UDISE, then re-import." />
            ) : ageLine.length === 0 && ageFallbackTotal != null ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface-3 px-4 text-center">
                <p className="text-sm font-medium text-ink">No per-age breakdown on file</p>
                <p className="text-2xl font-semibold tabular-nums text-accent">{ageFallbackTotal.toLocaleString("en-IN")}</p>
                <p className="max-w-sm text-xs text-muted">
                  Total students from the school record
                  {ageTotalMag > 0 ? " (matches the age Total row in the import)" : ""}. Add age-band rows in the master
                  import to restore the line chart.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ageLine} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#E2E8F0" />
                  <XAxis dataKey="age" {...CHART_AXIS} />
                  <YAxis {...CHART_AXIS} allowDecimals={false} width={36} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number | string) => [v ?? 0, "Students"]}
                    labelFormatter={(l) => `Age ${l}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="students"
                    name="Students"
                    stroke={PALETTE[0]}
                    strokeWidth={2.5}
                    dot={{ fill: PALETTE[1], strokeWidth: 0, r: 4 }}
                    activeDot={{ r: 6 }}
                    animationDuration={300}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Other categories" subtitle="CWSN, EWS, etc.">
          <div className="h-[260px]">
            {othersBar.length === 0 ? (
              <ChartEmpty title="No other-category rows" hint="Populate the enrolment_others sheet for this UDISE, then re-import." />
            ) : (
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={othersBar} margin={{ top: 12, right: 8, left: 0, bottom: 48 }}>
                      <CartesianGrid stroke="#E2E8F0" />
                      <XAxis
                        dataKey="name"
                        {...CHART_AXIS}
                        interval={0}
                        angle={-28}
                        textAnchor="end"
                        height={48}
                        tick={{ fill: "#64748B", fontSize: 10 }}
                      />
                      <YAxis {...CHART_AXIS} allowDecimals={false} width={32} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number | string) => [v ?? 0, "Students"]} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        {othersBar.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-line pt-2 text-center text-[11px] text-muted">
                  {othersBar.map((d, i) => (
                    <li key={d.name} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: PALETTE[i % PALETTE.length] }}
                      />
                      {d.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ChartCard>
      </motion.div>

      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <ChartCard title="Infra coverage" subtitle="Core facilities available vs gap">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Pie
                    data={infraPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={78}
                    paddingAngle={2}
                    animationDuration={300}
                  >
                    {infraPie.map((d, i) => (
                      <Cell key={i} fill={d.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number | string) => [v ?? 0, "Count"]} />
                  <Legend
                    layout="horizontal"
                    align="center"
                    verticalAlign="bottom"
                    wrapperStyle={{ ...LEGEND_STYLE, paddingTop: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-2">
              {infraStatus.map((f) => (
                <div key={f.key} className="flex items-center justify-between rounded-md border border-line px-2 py-1.5 text-xs">
                  <span className="text-ink">{f.label}</span>
                  <span className={f.ok ? "font-medium text-emerald-300" : "font-medium text-rose-300"}>
                    {f.ok ? "Available" : "Gap"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Digital facilities (functional)" subtitle="Installed digital assets and functional coverage">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-line bg-surface-3 px-2 py-1.5 text-xs">
              <div className="text-muted">Functional categories</div>
              <div className="font-semibold text-ink">
                {digitalFunctional} / {digitalRows.length}
              </div>
            </div>
            <div className="rounded-md border border-line bg-surface-3 px-2 py-1.5 text-xs">
              <div className="text-muted">Total units</div>
              <div className="font-semibold text-ink">{digitalTotalUnits.toLocaleString("en-IN")}</div>
            </div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={digitalRows} margin={{ top: 10, right: 10, left: 4, bottom: 24 }}>
                <CartesianGrid stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={44} />
                <YAxis {...CHART_AXIS} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number | string) => [v ?? 0, "Units"]} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={42}>
                  {digitalRows.map((r, i) => (
                    <Cell key={i} fill={r.count > 0 ? "#2563EB" : "#cbd5e1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="premium-panel rounded-xl p-5 premium-ring">
          <h2 className="text-sm font-semibold text-ink">Revenue scenarios (monthly / annual)</h2>
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-emerald-700">
              Low: {lowRev?.monthlyRevenue != null ? `₹${Math.round(lowRev.monthlyRevenue).toLocaleString("en-IN")} / mo` : "—"} ·{" "}
              {lowRev?.annualRevenue != null ? `₹${Math.round(lowRev.annualRevenue).toLocaleString("en-IN")} / yr` : "—"}
            </p>
            <p className="text-yellow-700">
              Medium: {mediumRev?.monthlyRevenue != null ? `₹${Math.round(mediumRev.monthlyRevenue).toLocaleString("en-IN")} / mo` : "—"} ·{" "}
              {mediumRev?.annualRevenue != null ? `₹${Math.round(mediumRev.annualRevenue).toLocaleString("en-IN")} / yr` : "—"}
            </p>
            <p className="text-rose-800">
              High: {highRev?.monthlyRevenue != null ? `₹${Math.round(highRev.monthlyRevenue).toLocaleString("en-IN")} / mo` : "—"} ·{" "}
              {highRev?.annualRevenue != null ? `₹${Math.round(highRev.annualRevenue).toLocaleString("en-IN")} / yr` : "—"}
            </p>
          </div>
          <Link
            to="/revenue"
            className="mt-4 inline-block text-sm font-medium text-accent transition-colors duration-150 hover:underline"
          >
            Change scenario →
          </Link>
        </section>

        <section id="pipeline" className="premium-panel rounded-xl p-5 premium-ring lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Progress</h2>
          <p className="mt-1 text-xs text-muted">Pipeline status · role-gated updates</p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <div className="text-xs text-muted">Current</div>
              <div className="mt-1">
                <PipelineBadge status={s.pipelineStatus} />
              </div>
            </div>
            <label className="text-xs text-muted">
              Set to
              <select
                className="mt-1 block min-w-[11rem] rounded-lg border border-line bg-surface-3 px-2 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                value={nextPipeline}
                onChange={(e) => setNextPipeline(e.target.value)}
              >
                {PIPELINE_STATUS_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {pipelineStatusLabel(k)}
                  </option>
                ))}
              </select>
            </label>
            <motion.button
              type="button"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover disabled:opacity-40"
              disabled={nextPipeline === s.pipelineStatus || statusMut.isPending || udise.length !== 11}
              onClick={() => statusMut.mutate()}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={fast}
            >
              Save
            </motion.button>
          </div>
          {statusMut.isError ? (
            <p className="mt-2 text-xs text-amber-800">Update failed — check role permissions.</p>
          ) : null}
          {s.progressEvents?.length ? (
            <div className="mt-4 border-t border-line pt-3">
              <div className="text-xs font-medium text-muted">Timeline</div>
              <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto text-xs text-muted">
                {s.progressEvents.map((ev, i) => (
                  <li key={`${ev.createdAt}-${i}`} className="border-l-2 border-accent/30 pl-3">
                    <span className="font-medium text-ink">{pipelineStatusLabel(ev.toStatus)}</span>
                    <span className="text-muted"> · {new Date(ev.createdAt).toLocaleString()}</span>
                    {ev.note ? <div className="text-muted">{ev.note}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <div className="pb-4 text-center">
        <Link to="/map" className="text-sm text-accent hover:underline">
          ← Back to map
        </Link>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value?: number | string | null }) {
  const num = typeof value === "number" && Number.isFinite(value) ? value : null;
  return (
    <motion.div
      variants={staggerItem}
      className="rounded-lg border border-line bg-surface-3 px-4 py-3"
      whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
      transition={fast}
    >
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink">
        {num != null ? <CountUp end={num} duration={0.3} preserveValue separator="," /> : (value ?? "—")}
      </div>
    </motion.div>
  );
}

function ChartCard({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section
      variants={staggerItem}
      className="premium-panel rounded-xl p-5 premium-ring"
      whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
      transition={fast}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
        </div>
        {badge}
      </div>
      <motion.div
        className="mt-4"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={normal}
      >
        {children}
      </motion.div>
    </motion.section>
  );
}
