/**
 * Merge bulk import job stats + API verification JSON into a founder-facing report (console + JSON + optional CSV).
 * Usage: npm run verify:report -w @jnv/api
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { getPrisma } from "../src/shared/prisma.js";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const devDb = path.join(API_ROOT, "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

const API_REPORT = path.join(API_ROOT, "reports", "verification-api.json");
const OUT_JSON = path.join(API_ROOT, "reports", "release-report.json");
const OUT_CSV = path.join(API_ROOT, "reports", "release-report-summary.csv");

function toCsv(rows: Record<string, string | number | boolean | null>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

async function main() {
  const prisma = getPrisma();
  const lastJob = await prisma.importJob.findFirst({ orderBy: { createdAt: "desc" } });
  const schoolRows = await prisma.school.findMany({
    select: {
      udise: true,
      schoolName: true,
      parsingStatus: true,
      overallExtractionConfidence: true,
      pdfRelativePath: true,
      profileCompletenessPct: true,
    },
    orderBy: { udise: "asc" },
  });

  let apiReport: {
    generatedAt?: string;
    totalSchools?: number;
    apiDetailPass?: number;
    failures?: { udise: string; step: string; reason: string }[];
    ok?: boolean;
  } | null = null;
  try {
    apiReport = JSON.parse(fs.readFileSync(API_REPORT, "utf8")) as typeof apiReport;
  } catch {
    apiReport = null;
  }

  const complete = schoolRows.filter((s) => s.parsingStatus === "COMPLETE").length;
  const partial = schoolRows.filter((s) => s.parsingStatus === "PARTIAL").length;
  const failed = schoolRows.filter((s) => s.parsingStatus === "FAILED").length;
  const pending = schoolRows.filter((s) => s.parsingStatus === "PENDING").length;
  const lowConfidence = schoolRows.filter(
    (s) => (s.overallExtractionConfidence ?? 0) > 0 && (s.overallExtractionConfidence ?? 1) < 0.65,
  ).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    importJob: lastJob
      ? {
          id: lastJob.id,
          status: lastJob.status,
          totalFiles: lastJob.totalFiles,
          processedFiles: lastJob.processedFiles,
          successCount: lastJob.successCount,
          errorCount: lastJob.errorCount,
          finishedAt: lastJob.finishedAt?.toISOString() ?? null,
        }
      : null,
    schools: {
      total: schoolRows.length,
      completeProfiles: complete,
      partialProfiles: partial,
      failedImport: failed,
      pending: pending,
      lowConfidenceSectionsApprox: lowConfidence,
    },
    apiVerification: apiReport
      ? {
          lastRun: apiReport.generatedAt ?? null,
          detailPass: apiReport.apiDetailPass ?? 0,
          totalChecked: apiReport.totalSchools ?? 0,
          ok: apiReport.ok ?? false,
          failureCount: apiReport.failures?.length ?? 0,
        }
      : { lastRun: null, detailPass: 0, totalChecked: 0, ok: false, failureCount: 0 },
    uiVerification: {
      note: "Run e2e:release for Playwright screenshots; paths under apps/web/e2e/screenshots-output/",
    },
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ summary, schools: schoolRows, apiFailures: apiReport?.failures ?? [] }, null, 2));

  const csvRow = [
    {
      metric: "total_schools",
      value: schoolRows.length,
    },
    {
      metric: "import_processed",
      value: lastJob?.processedFiles ?? "",
    },
    {
      metric: "import_success",
      value: lastJob?.successCount ?? "",
    },
    {
      metric: "import_errors",
      value: lastJob?.errorCount ?? "",
    },
    {
      metric: "api_verification_ok",
      value: apiReport?.ok ?? false,
    },
    {
      metric: "api_failures",
      value: apiReport?.failures?.length ?? "",
    },
  ];
  fs.writeFileSync(OUT_CSV, toCsv(csvRow), "utf8");

  console.log(`\n=== Release report ===\n${JSON.stringify(summary, null, 2)}`);
  console.log(`\nWrote ${OUT_JSON}\nWrote ${OUT_CSV}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
