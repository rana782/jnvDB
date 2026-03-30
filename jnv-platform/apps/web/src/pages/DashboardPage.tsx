import { type ReactNode, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import CountUp from "react-countup";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiJson } from "../lib/api";
import { fast, normal, staggerContainer, staggerItem } from "../lib/animationConfig";
import type { DashboardOverview, RevenueProjectionResponse } from "../types/school-api";

const REVENUE_PRESET_STORAGE_KEY = "jnv.revenue.presetInputs.v1";
type PresetKey = "LOW" | "MEDIUM" | "HIGH";
type PresetInputs = Record<PresetKey, { pricePerWash: number; washesPerStudentPerMonth: number; adoptionRate: number }>;
const DEFAULT_PRESET_INPUTS: PresetInputs = {
  LOW: { pricePerWash: 20, washesPerStudentPerMonth: 2, adoptionRate: 0.6 },
  MEDIUM: { pricePerWash: 30, washesPerStudentPerMonth: 4, adoptionRate: 0.85 },
  HIGH: { pricePerWash: 40, washesPerStudentPerMonth: 6, adoptionRate: 0.95 },
};

const TOOLTIP = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: "8px",
  color: "#0F172A",
  boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
};
const AXIS = { stroke: "#CBD5E1", tick: { fill: "#64748B", fontSize: 11 } };

async function fetchOverview(): Promise<DashboardOverview> {
  return apiJson<DashboardOverview>("/api/dashboard/overview");
}

function readSavedPresetInputs(): PresetInputs {
  if (typeof window === "undefined") return DEFAULT_PRESET_INPUTS;
  try {
    const raw = window.localStorage.getItem(REVENUE_PRESET_STORAGE_KEY);
    if (!raw) return DEFAULT_PRESET_INPUTS;
    const parsed = JSON.parse(raw) as Partial<PresetInputs>;
    const safe = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    return {
      LOW: {
        pricePerWash: safe(parsed?.LOW?.pricePerWash, DEFAULT_PRESET_INPUTS.LOW.pricePerWash),
        washesPerStudentPerMonth: safe(
          parsed?.LOW?.washesPerStudentPerMonth,
          DEFAULT_PRESET_INPUTS.LOW.washesPerStudentPerMonth,
        ),
        adoptionRate: safe(parsed?.LOW?.adoptionRate, DEFAULT_PRESET_INPUTS.LOW.adoptionRate),
      },
      MEDIUM: {
        pricePerWash: safe(parsed?.MEDIUM?.pricePerWash, DEFAULT_PRESET_INPUTS.MEDIUM.pricePerWash),
        washesPerStudentPerMonth: safe(
          parsed?.MEDIUM?.washesPerStudentPerMonth,
          DEFAULT_PRESET_INPUTS.MEDIUM.washesPerStudentPerMonth,
        ),
        adoptionRate: safe(parsed?.MEDIUM?.adoptionRate, DEFAULT_PRESET_INPUTS.MEDIUM.adoptionRate),
      },
      HIGH: {
        pricePerWash: safe(parsed?.HIGH?.pricePerWash, DEFAULT_PRESET_INPUTS.HIGH.pricePerWash),
        washesPerStudentPerMonth: safe(
          parsed?.HIGH?.washesPerStudentPerMonth,
          DEFAULT_PRESET_INPUTS.HIGH.washesPerStudentPerMonth,
        ),
        adoptionRate: safe(parsed?.HIGH?.adoptionRate, DEFAULT_PRESET_INPUTS.HIGH.adoptionRate),
      },
    };
  } catch {
    return DEFAULT_PRESET_INPUTS;
  }
}

async function fetchProjection(preset: PresetKey, presetInputs: PresetInputs): Promise<RevenueProjectionResponse> {
  return apiJson<RevenueProjectionResponse>("/api/revenue/projection", {
    method: "POST",
    body: JSON.stringify({
      preset,
      presetOverrides: {
        LOW: presetInputs.LOW,
        MEDIUM: presetInputs.MEDIUM,
        HIGH: presetInputs.HIGH,
      },
      schoolPage: 1,
      schoolPageSize: 25,
    }),
  });
}

function inr(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function DashboardPage() {
  const savedPresetInputs = useMemo(() => readSavedPresetInputs(), []);
  const presetFingerprint = useMemo(() => JSON.stringify(savedPresetInputs), [savedPresetInputs]);
  const q = useQuery({ queryKey: ["dashboard-overview"], queryFn: fetchOverview });
  const lowQ = useQuery({
    queryKey: ["dashboard-revenue-low", presetFingerprint],
    queryFn: () => fetchProjection("LOW", savedPresetInputs),
  });
  const medQ = useQuery({
    queryKey: ["dashboard-revenue-medium", presetFingerprint],
    queryFn: () => fetchProjection("MEDIUM", savedPresetInputs),
  });
  const highQ = useQuery({
    queryKey: ["dashboard-revenue-high", presetFingerprint],
    queryFn: () => fetchProjection("HIGH", savedPresetInputs),
  });
  const d = q.data;
  const statesByOpportunity = useMemo(() => {
    return [...(medQ.data?.byState ?? [])].sort((a, b) => b.totalStudents - a.totalStudents || a.state.localeCompare(b.state));
  }, [medQ.data?.byState]);

  const regionsByRevenue = useMemo(() => {
    const stateToRegion = new Map<string, string>();
    const regionCodeToName = new Map<string, string>();
    for (const row of d?.stateRegionMap ?? []) {
      stateToRegion.set(row.state.trim().toLowerCase(), row.regionCode);
      regionCodeToName.set(row.regionCode, row.regionName);
    }
    const out = new Map<string, { schools: number; low: number; medium: number; high: number }>();
    const low = lowQ.data?.byState ?? [];
    const med = medQ.data?.byState ?? [];
    const high = highQ.data?.byState ?? [];
    const states = new Set<string>([...low.map((x) => x.state), ...med.map((x) => x.state), ...high.map((x) => x.state)]);
    for (const state of states) {
      const regionCode = stateToRegion.get(state.trim().toLowerCase()) ?? "UNMAPPED";
      const region = regionCodeToName.get(regionCode) ?? "Unmapped region";
      const l = low.find((x) => x.state === state)?.monthlyRevenue ?? 0;
      const m = med.find((x) => x.state === state)?.monthlyRevenue ?? 0;
      const h = high.find((x) => x.state === state)?.monthlyRevenue ?? 0;
      const schools = med.find((x) => x.state === state)?.schoolCount ?? 0;
      const row = out.get(region) ?? { schools: 0, low: 0, medium: 0, high: 0 };
      row.schools += schools;
      row.low += l;
      row.medium += m;
      row.high += h;
      out.set(region, row);
    }
    for (const [code, name] of regionCodeToName.entries()) {
      if (code === "UNMAPPED") continue;
      if (!out.has(name)) out.set(name, { schools: 0, low: 0, medium: 0, high: 0 });
    }
    return [...out.entries()]
      .map(([region, v]) => ({ region, ...v }))
      .sort((a, b) => b.medium - a.medium || b.high - a.high || a.region.localeCompare(b.region));
  }, [d?.stateRegionMap, lowQ.data?.byState, medQ.data?.byState, highQ.data?.byState]);

  if (q.isPending) return <Skeleton />;
  if (q.isError || !d) {
    return (
      <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
        Could not load dashboard. Ensure the API is running and you are online.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold premium-gradient-text">Dashboard</h1>
        <p className="text-sm text-muted">
          Portfolio snapshot with Indian revenue formatting and 3 revenue models (Low / Medium / High).
        </p>
      </div>

      <motion.div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <StatCard label="Total schools" value={d.totalSchools} hint="In database" />
        <StatCard label="Total students" value={d.totalStudents} hint="Sum of headcounts" />
        <motion.div
          variants={staggerItem}
          className="premium-panel rounded-xl p-4 premium-ring"
          whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
          transition={fast}
        >
          <div className="text-xs uppercase tracking-wide text-muted">Revenue potential</div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="text-emerald-700">
              Low: {inr(lowQ.data?.portfolio.monthlyRevenue ?? 0)} /mo · {inr(lowQ.data?.portfolio.annualRevenue ?? 0)} /yr
            </div>
            <div className="text-yellow-700">
              Medium: {inr(medQ.data?.portfolio.monthlyRevenue ?? 0)} /mo · {inr(medQ.data?.portfolio.annualRevenue ?? 0)} /yr
            </div>
            <div className="text-rose-800">
              High: {inr(highQ.data?.portfolio.monthlyRevenue ?? 0)} /mo · {inr(highQ.data?.portfolio.annualRevenue ?? 0)} /yr
            </div>
          </div>
        </motion.div>
        <StatCard label="Completed schools" value={d.schoolsCompleted} hint="Pipeline status DONE" />
      </motion.div>

      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={staggerItem} className="premium-panel rounded-xl p-4 premium-ring">
          <h2 className="text-sm font-semibold text-ink">States by opportunity</h2>
          <p className="text-xs text-muted">All states · sorted by total students</p>
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2">State</th>
                  <th className="py-1 pr-2 text-right">Schools</th>
                  <th className="py-1 pr-2 text-right">Students</th>
                  <th className="py-1 pr-2 text-right text-emerald-700">Low/mo</th>
                  <th className="py-1 pr-2 text-right text-yellow-700">Medium/mo</th>
                  <th className="py-1 text-right text-rose-800">High/mo</th>
                </tr>
              </thead>
              <tbody>
                {statesByOpportunity.map((r) => (
                  <tr key={r.state} className="border-t border-line">
                    <td className="py-2 pr-2 text-ink">{r.state}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-muted">{r.schoolCount}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-ink">{r.totalStudents.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-emerald-700">
                      {inr(lowQ.data?.byState.find((x) => x.state === r.state)?.monthlyRevenue ?? 0)}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-yellow-700">
                      {inr(medQ.data?.byState.find((x) => x.state === r.state)?.monthlyRevenue ?? 0)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-rose-800">
                      {inr(highQ.data?.byState.find((x) => x.state === r.state)?.monthlyRevenue ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        <motion.div variants={staggerItem} className="premium-panel rounded-xl p-4 premium-ring">
          <h2 className="text-sm font-semibold text-ink">Top regions by revenue</h2>
          <p className="text-xs text-muted">Sorted by Medium monthly revenue</p>
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2">Region</th>
                  <th className="py-1 pr-2 text-right">Schools</th>
                  <th className="py-1 pr-2 text-right text-emerald-700">Low/mo</th>
                  <th className="py-1 pr-2 text-right text-yellow-700">Medium/mo</th>
                  <th className="py-1 text-right text-rose-800">High/mo</th>
                </tr>
              </thead>
              <tbody>
                {regionsByRevenue.map((r) => (
                  <tr key={r.region} className="border-t border-line">
                    <td className="py-2 pr-2 text-ink">{r.region}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-muted">{r.schools}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-emerald-700">{inr(r.low)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-yellow-700">{inr(r.medium)}</td>
                    <td className="py-2 text-right tabular-nums text-rose-800">{inr(r.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">Charts</h2>
        <motion.div
          className="grid gap-6 lg:grid-cols-1"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <ChartCard title="State-wise distribution" subtitle="All states by school count">
            <div className="h-[300px] w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={d.charts.stateDistribution}
                  margin={{ left: 4, right: 12, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#22345F" horizontal={false} />
                  <XAxis type="number" {...AXIS} tick={{ fill: "#64748B", fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={108} {...AXIS} tick={{ fill: "#64748B", fontSize: 10 }} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Bar dataKey="schools" name="Schools" fill="#5B7CFF" radius={[0, 4, 4, 0]} animationDuration={300} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </motion.div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      variants={staggerItem}
      className="premium-panel rounded-xl p-4 premium-ring"
      whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
      transition={fast}
    >
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="text-xs text-muted">{subtitle}</p>
      <motion.div className="mt-3" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={normal}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <motion.div
      variants={staggerItem}
      className="premium-panel rounded-xl p-4 premium-ring"
      whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
      transition={fast}
    >
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <motion.div className="mt-2 text-3xl font-semibold text-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fast}>
        <CountUp end={value} duration={0.3} preserveValue separator="," />
      </motion.div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </motion.div>
  );
}

function Skeleton() {
  return (
    <motion.div className="text-muted" animate={{ opacity: [0.55, 1, 0.55] }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}>
      Loading dashboard…
    </motion.div>
  );
}
