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
import type {
  EnrolmentAgeChartRow,
  EnrolmentCategoryChartRow,
  SchoolDetailResponse,
} from "../types/school-api";

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

const CHART_AXIS = { stroke: "#94a3b8", tick: { fill: "#64748b", fontSize: 11 } };
const TOOLTIP_STYLE = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: "8px",
  boxShadow: "0 4px 24px rgba(15,23,42,0.08)",
};
const LEGEND_STYLE = { color: "#64748b", fontSize: "12px", paddingTop: "8px" };

const SOCIAL_ORDER = ["SC", "ST", "OBC", "General"] as const;

function socialCategorySlots(rows: EnrolmentCategoryChartRow[]): {
  label: (typeof SOCIAL_ORDER)[number];
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
      if (r.total != null) return r.total;
      const sum = (r.boys ?? 0) + (r.girls ?? 0);
      if (sum > 0) return sum;
      const cv = r.chartValue;
      if (typeof cv === "number" && cv > 0) return cv;
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

function confidenceBadgeClass(confidence: number): string {
  if (confidence >= 0.7) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (confidence >= 0.4) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-line bg-slate-50 text-muted";
}

function ChartEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-line bg-canvas px-4 text-center">
      <p className="text-sm font-medium text-muted">{title}</p>
      <p className="mt-2 max-w-xs text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function ConfidencePill({ extractionConfidence }: { extractionConfidence: number | null | undefined }) {
  if (extractionConfidence != null) {
    return (
      <span
        className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${confidenceBadgeClass(extractionConfidence)}`}
        title="Overall extraction confidence from the last PDF import"
      >
        Confidence {Math.round(extractionConfidence * 100)}%
      </span>
    );
  }
  return (
    <span
      className="shrink-0 rounded-full border border-line bg-canvas px-3 py-1 text-xs text-muted"
      title="No extraction confidence stored yet"
    >
      No confidence
    </span>
  );
}

function toPieSlices(
  rows: EnrolmentCategoryChartRow[] | undefined,
  options?: { excludeTotal?: boolean },
): { name: string; value: number }[] {
  const list = Array.isArray(rows) ? rows : [];
  const exTotal = options?.excludeTotal !== false;
  return list
    .filter((r) => (r.chartValue ?? 0) > 0)
    .filter((r) => !exTotal || String(r.category ?? "").trim().toLowerCase() !== "total")
    .map((r) => ({
      name: (r.category ?? "").trim() || "—",
      value: r.chartValue ?? 0,
    }));
}

function toAgeLinePoints(rows: EnrolmentAgeChartRow[] | undefined): { age: string; students: number }[] {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((r) => (r.chartValue ?? 0) > 0)
    .filter((r) => String(r.ageBand ?? "").trim().toLowerCase() !== "total")
    .map((r) => ({
      age: (r.ageBand ?? "").trim() || "—",
      students: r.chartValue ?? 0,
    }))
    .sort((a, b) => (parseInt(a.age, 10) || 0) - (parseInt(b.age, 10) || 0));
}

type RevRow = { kind?: string; monthlyRevenue?: number | null; annualRevenue?: number | null };

function pickCustomRevenue(school: { revenueScenarios?: unknown }): RevRow | undefined {
  const rows = school.revenueScenarios;
  if (!Array.isArray(rows)) return undefined;
  return rows.find((r): r is RevRow => typeof r === "object" && r != null && (r as RevRow).kind === "CUSTOM") as
    | RevRow
    | undefined;
}

export function SchoolDetailPage() {
  const { udise = "" } = useParams();
  const { setBreadcrumb } = useShellOutlet();
  const q = useQuery({ queryKey: ["school", udise], queryFn: () => fetchSchool(udise), enabled: !!udise });
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
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load school.</div>;
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
    pdfPath,
    extractionConfidence,
  } = q.data;

  const customRev = pickCustomRevenue(s);
  const slots = socialCategorySlots(enrolmentSocial);
  const hasSocialData = slots.some((x) => x.value != null && x.value > 0);
  const socialPieData = slots
    .filter((x) => x.value != null && x.value > 0)
    .map((x) => ({ name: x.label, value: x.value as number }));
  const socialBarData = socialPieData.map((d) => ({ name: d.name, students: d.value }));

  const minorityPie = toPieSlices(enrolmentMinority, { excludeTotal: true });
  const othersBar = toPieSlices(enrolmentOthers, { excludeTotal: true });
  const ageLine = toAgeLinePoints(enrolmentAge);

  const fetching = q.isFetching ? "opacity-[0.92]" : "";
  const pct = Math.round(s.profileCompletenessPct ?? 0);
  const dist = s.location?.geographicDistrict;
  const headerTitle = dist ? `${s.profile?.schoolName ?? "—"} (${dist})` : (s.profile?.schoolName ?? "—");

  return (
    <div className={`mx-auto max-w-7xl space-y-6 ${fetching}`}>
      <header className="rounded-xl border border-line bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">School</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{headerTitle}</h1>
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
            <ConfidencePill extractionConfidence={extractionConfidence} />
            <motion.a
              href="#pipeline"
              className="inline-block rounded-lg border border-line bg-canvas px-3 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:border-accent/40 hover:bg-white"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={fast}
            >
              Mark status
            </motion.a>
            <motion.a
              href="#notes"
              className="inline-block rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={fast}
            >
              Add note
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
          <MetricCard label="Readiness" value={`${pct}%`} />
        </motion.div>
        {s.provenance?.importLastError ? (
          <p className="mt-4 text-xs text-amber-800">Import error: {s.provenance.importLastError}</p>
        ) : null}
      </header>

      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <ChartCard title="Social category" subtitle="SC, ST, OBC, General" badge={<ConfidencePill extractionConfidence={extractionConfidence} />}>
          {!hasSocialData ? (
            <ChartEmpty
              title="No social-category data"
              hint="Import a report card PDF or confirm enrolment rows exist for this school."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-[220px] min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Pie
                      data={socialPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="42%"
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
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={LEGEND_STYLE}
                      formatter={(value) => <span className="text-ink">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[220px] min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={socialBarData} margin={{ top: 16, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
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

        <ChartCard title="Minority" subtitle="Composition (Total excluded)" badge={<ConfidencePill extractionConfidence={extractionConfidence} />}>
          <div className="h-[260px]">
            {minorityPie.length === 0 ? (
              <ChartEmpty title="No minority breakdown" hint="Data appears after import writes minority rows." />
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

        <ChartCard title="Age distribution" subtitle="By age band" badge={<ConfidencePill extractionConfidence={extractionConfidence} />}>
          <div className="h-[260px]">
            {ageLine.length === 0 ? (
              <ChartEmpty title="No age-band data" hint="Import must populate SchoolEnrolmentAge." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ageLine} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
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

        <ChartCard title="Other categories" subtitle="CWSN, EWS, etc." badge={<ConfidencePill extractionConfidence={extractionConfidence} />}>
          <div className="h-[260px]">
            {othersBar.length === 0 ? (
              <ChartEmpty title="No other-category rows" hint="Import must populate SchoolEnrolmentOthers." />
            ) : (
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={othersBar} margin={{ top: 12, right: 8, left: 0, bottom: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        dataKey="name"
                        {...CHART_AXIS}
                        interval={0}
                        angle={-28}
                        textAnchor="end"
                        height={48}
                        tick={{ fill: "#64748b", fontSize: 10 }}
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

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Revenue (CUSTOM model)</h2>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-success">
            {customRev?.monthlyRevenue != null ? `₹${Math.round(customRev.monthlyRevenue).toLocaleString()} / mo` : "—"}
          </p>
          <p className="mt-1 text-sm text-muted">
            Yearly:{" "}
            {customRev?.annualRevenue != null ? `₹${Math.round(customRev.annualRevenue).toLocaleString()}` : "—"}
          </p>
          <Link
            to="/revenue"
            className="mt-4 inline-block text-sm font-medium text-accent transition-colors duration-150 hover:underline"
          >
            Change scenario →
          </Link>
        </section>

        <section id="pipeline" className="rounded-xl border border-line bg-card p-5 shadow-sm lg:col-span-2">
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
                className="mt-1 block min-w-[11rem] rounded-lg border border-line bg-canvas px-2 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted">
              <span>Profile completeness</span>
              <span className="tabular-nums text-ink">{pct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-success transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </div>
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

      <section id="notes" className="rounded-xl border border-line bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Notes</h2>
        <p className="mt-1 text-sm text-muted">
          Structured field notes and follow-ups can be added via the API. PDF path:{" "}
          <span className="font-mono text-xs text-ink">{pdfPath ?? "—"}</span>
        </p>
        <p className="mt-2 text-xs text-muted">
          Pilot suitable: <span className="font-medium text-ink">{s.pilotSuitable ? "Yes" : "No"}</span>
        </p>
      </section>

      {udise.length === 11 && pdfPath ? (
        <section className="rounded-xl border border-line bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Report card PDF</h2>
            <a
              href={`/api/schools/${udise}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent hover:underline"
            >
              Open in new tab
            </a>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-line bg-canvas">
            <iframe
              title="School PDF"
              src={`/api/schools/${udise}/pdf`}
              className="h-[min(70vh,640px)] w-full"
            />
          </div>
        </section>
      ) : null}

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
      className="rounded-lg border border-line bg-canvas px-4 py-3"
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
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section
      variants={staggerItem}
      className="rounded-xl border border-line bg-card p-5 shadow-sm"
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
