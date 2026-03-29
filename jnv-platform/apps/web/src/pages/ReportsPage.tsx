export function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-ink">Reports</h1>
      <p className="text-sm text-muted">
        CSV export lives at{" "}
        <code className="rounded bg-canvas px-1 py-0.5 font-mono text-accent">GET /api/reports/schools.csv</code>{" "}
        (authenticated).
      </p>
      <a
        className="inline-flex rounded-md border border-line px-4 py-2 text-sm text-accent transition-colors duration-100 hover:bg-canvas"
        href="/api/reports/schools.csv"
      >
        Download CSV (same origin)
      </a>
    </div>
  );
}
