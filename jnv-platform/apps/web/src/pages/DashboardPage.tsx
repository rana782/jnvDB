import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import CountUp from "react-countup";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiJson } from "../lib/api";
import { fast, normal, staggerContainer, staggerItem } from "../lib/animationConfig";
import type { DashboardOverview } from "../types/school-api";

const TOOLTIP = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: "8px",
  boxShadow: "0 4px 24px rgba(15,23,42,0.08)",
};
const AXIS = { stroke: "#94a3b8", tick: { fill: "#64748b", fontSize: 11 } };

async function fetchOverview(): Promise<DashboardOverview> {
  return apiJson<DashboardOverview>("/api/dashboard/overview");
}

export function DashboardPage() {
  const q = useQuery({ queryKey: ["dashboard-overview"], queryFn: fetchOverview });

  if (q.isPending) return <Skeleton />;
  if (q.isError) {
    return (
      <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
        Could not load dashboard. Ensure the API is running and you are online.
      </div>
    );
  }

  const d = q.data;
  const formatInr = (n: number) => `₹${Math.round(n).toLocaleString()}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-muted">
          Portfolio snapshot from <code className="text-accent">GET /api/dashboard/overview</code> — KPIs, rankings,
          and distributions from live school data (CUSTOM revenue model per school).
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
          className="rounded-xl border border-line bg-card p-4 shadow-sm"
          whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
          transition={fast}
        >
          <div className="text-xs uppercase tracking-wide text-muted">Revenue potential (model)</div>
          <div className="mt-2 text-2xl font-semibold text-success">
            {formatInr(d.portfolioMonthlyRevenue)}
          </div>
          <div className="text-xs text-muted">Monthly — CUSTOM scenarios summed</div>
          <div className="mt-2 text-sm text-muted">Annual {formatInr(d.portfolioAnnualRevenue)}</div>
        </motion.div>
        <StatCard label="Completed schools" value={d.schoolsCompleted} hint="Pipeline status DONE" />
      </motion.div>

      <motion.div
        className="grid gap-4 md:grid-cols-2"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-line bg-card p-4 text-sm text-ink shadow-sm"
          whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
          transition={fast}
        >
          <div className="text-xs uppercase text-muted">Enrolment split</div>
          <div className="mt-2 flex gap-8">
            <div>
              <div className="text-2xl font-semibold text-ink">{d.totalBoys.toLocaleString()}</div>
              <div className="text-xs text-muted">Boys</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink">{d.totalGirls.toLocaleString()}</div>
              <div className="text-xs text-muted">Girls</div>
            </div>
          </div>
        </motion.div>
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-line bg-card p-4 text-xs text-muted shadow-sm"
          whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
          transition={fast}
        >
          <span className="font-medium text-ink">Opportunity</span> ranks states by total enrolled students (then by
          summed monthly model revenue). <span className="font-medium text-ink">Region readiness</span> is mean
          profile completeness % among schools linked to an NVS region.
        </motion.div>
      </motion.div>

      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={staggerItem} className="rounded-xl border border-line bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Top states by opportunity</h2>
          <p className="text-xs text-muted">By total students (tie-break: model ₹ / mo sum)</p>
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2">State</th>
                  <th className="py-1 pr-2 text-right">Schools</th>
                  <th className="py-1 pr-2 text-right">Students</th>
                  <th className="py-1 text-right">{"₹ / mo (sum)"}</th>
                </tr>
              </thead>
              <tbody>
                {d.topStatesByOpportunity.map((r) => (
                  <tr key={r.state} className="border-t border-line">
                    <td className="py-2 pr-2 text-ink">{r.state}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-muted">{r.schoolCount}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-ink">
                      {r.totalStudents.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums text-success">
                      {formatInr(r.monthlyRevenueSum)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
        <motion.div variants={staggerItem} className="rounded-xl border border-line bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Top regions by readiness</h2>
          <p className="text-xs text-muted">Average profile completeness % (schools with data)</p>
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2">Region</th>
                  <th className="py-1 pr-2 text-right">Schools</th>
                  <th className="py-1 text-right">Avg readiness</th>
                </tr>
              </thead>
              <tbody>
                {d.topRegionsByReadiness.map((r) => (
                  <tr key={r.regionCode} className="border-t border-line">
                    <td className="py-2 pr-2">
                      <div className="text-ink">{r.regionName}</div>
                      <div className="font-mono text-xs text-muted">{r.regionCode}</div>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-muted">{r.schoolCount}</td>
                    <td className="py-2 text-right tabular-nums text-accent">
                      {r.avgReadiness != null ? `${r.avgReadiness}%` : "—"}
                    </td>
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
          className="grid gap-6 lg:grid-cols-1 xl:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <ChartCard title="State-wise distribution" subtitle="Top 12 states by school count (+ other)">
            <div className="h-[300px] w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={d.charts.stateDistribution}
                  margin={{ left: 4, right: 12, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" {...AXIS} tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={108}
                    {...AXIS}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { name: string; schools: number; students: number };
                      return (
                        <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-ink shadow-md">
                          <div className="font-medium text-ink">{p.name}</div>
                          <div>Schools: {p.schools}</div>
                          <div>Students: {p.students.toLocaleString()}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="schools" name="Schools" fill="#2563EB" radius={[0, 4, 4, 0]} animationDuration={300} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Revenue distribution" subtitle="Schools by CUSTOM monthly model band">
            <div className="h-[300px] w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.charts.revenueDistribution} margin={{ left: 4, right: 8, top: 8, bottom: 56 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="label"
                    {...AXIS}
                    tick={{ fill: "#64748b", fontSize: 9 }}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={52}
                  />
                  <YAxis {...AXIS} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Bar dataKey="count" name="Schools" fill="#10B981" radius={[4, 4, 0, 0]} animationDuration={300} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Readiness distribution" subtitle="Schools by profile completeness %">
            <div className="h-[300px] w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.charts.readinessDistribution} margin={{ left: 4, right: 8, top: 8, bottom: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" {...AXIS} tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis {...AXIS} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Bar dataKey="count" name="Schools" fill="#6366F1" radius={[4, 4, 0, 0]} animationDuration={300} />
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
      className="rounded-xl border border-line bg-card p-4 shadow-sm"
      whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
      transition={fast}
    >
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="text-xs text-muted">{subtitle}</p>
      <motion.div
        className="mt-3"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={normal}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <motion.div
      variants={staggerItem}
      className="rounded-xl border border-line bg-card p-4 shadow-sm"
      whileHover={{ y: -4, boxShadow: "0px 10px 30px rgba(0,0,0,0.08)" }}
      transition={fast}
    >
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <motion.div
        className="mt-2 text-3xl font-semibold text-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={fast}
      >
        <CountUp end={value} duration={0.3} preserveValue separator="," />
      </motion.div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </motion.div>
  );
}

function Skeleton() {
  return (
    <motion.div
      className="text-muted"
      animate={{ opacity: [0.55, 1, 0.55] }}
      transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
    >
      Loading dashboard…
    </motion.div>
  );
}
