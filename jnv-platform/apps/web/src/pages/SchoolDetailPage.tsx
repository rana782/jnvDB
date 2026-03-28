import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
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
import type { SchoolCanonical } from "../types/school-api";

async function fetchSchool(udise: string): Promise<SchoolCanonical> {
  return apiJson<SchoolCanonical>(`/api/schools/${udise}`);
}

export function SchoolDetailPage() {
  const { udise = "" } = useParams();
  const q = useQuery({ queryKey: ["school", udise], queryFn: () => fetchSchool(udise), enabled: !!udise });

  if (q.isPending) return <div className="text-slate-500">Loading school…</div>;
  if (q.isError) return <div className="text-amber">Could not load school.</div>;

  const s = q.data;
  const social = s.chartSeries.enrolmentSocial;
  const chartData =
    social.length > 0
      ? social.map((e) => ({ name: e.category, students: e.total ?? (e.boys ?? 0) + (e.girls ?? 0) }))
      : [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-navy-light p-6">
        <div className="text-xs uppercase text-slate-500">School</div>
        <h1 className="mt-1 text-2xl font-semibold text-white">{s.profile.schoolName}</h1>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-400">
          <span className="font-mono text-teal-light">{s.udise}</span>
          <span>{s.location.geographicState}</span>
          <span>{s.location.geographicDistrict}</span>
          <span>Pipeline: {s.pipelineStatus}</span>
          <span>Parse: {s.provenance.parsingStatus}</span>
          {s.provenance.academicYear ? <span>Year: {s.provenance.academicYear}</span> : null}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Metric label="Students" value={s.enrolmentHeadcount.totalStudents} />
          <Metric label="Boys" value={s.enrolmentHeadcount.totalBoys} />
          <Metric label="Girls" value={s.enrolmentHeadcount.totalGirls} />
        </div>
        {s.provenance.importLastError ? (
          <p className="mt-3 text-xs text-amber-300">Import error: {s.provenance.importLastError}</p>
        ) : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-navy-light p-4">
          <h2 className="text-sm font-semibold text-slate-200">Enrolment by social category</h2>
          <div className="mt-4 h-64">
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-500">No enrolment breakdown in the database for this school yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                  <Bar dataKey="students" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="space-y-4 rounded-xl border border-slate-800 bg-navy-light p-4">
          <h2 className="text-sm font-semibold text-slate-200">Insights</h2>
          <p className="text-sm text-slate-400">
            Profile completeness:{" "}
            <span className="text-white">{Math.round(s.profileCompletenessPct ?? 0)}%</span>. Pilot:{" "}
            {s.pilotSuitable ? "yes" : "no"}.
          </p>
          <p className="text-xs text-slate-500">
            PDF: {s.provenance.pdfRelativePath ?? "—"} · Hash:{" "}
            {s.provenance.sourcePdfHash ? `${s.provenance.sourcePdfHash.slice(0, 12)}…` : "—"} · Confidence:{" "}
            {s.provenance.overallExtractionConfidence != null
              ? Math.round(s.provenance.overallExtractionConfidence * 100) / 100
              : "—"}
          </p>
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-xs text-slate-500">
            PDF viewer: embed <code className="text-teal-light">/api/schools/:udise/pdf</code> in an iframe when
            authenticated and path exists.
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value?: number | null }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-white">{value ?? "—"}</div>
    </div>
  );
}
