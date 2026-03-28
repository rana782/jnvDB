export function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white">Reports</h1>
      <p className="text-sm text-slate-400">
        CSV export lives at{" "}
        <code className="rounded bg-slate-900 px-1 py-0.5 text-teal-light">GET /api/reports/schools.csv</code>{" "}
        (authenticated).
      </p>
      <a
        className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm text-teal-light hover:bg-slate-900"
        href="/api/reports/schools.csv"
      >
        Download CSV (same origin)
      </a>
    </div>
  );
}
