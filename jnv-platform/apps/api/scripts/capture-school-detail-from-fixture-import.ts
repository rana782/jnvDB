/**
 * Import report-card-sample.pdf into a temp DB, then capture GET /api/schools/11050300101.
 * Writes test/fixtures/acceptance-get-school-detail.response.json (real Fastify + Prisma stack).
 *
 * Usage (from apps/api): npx tsx scripts/capture-school-detail-from-fixture-import.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const FIXTURE_PDF = path.join(apiRoot, "test", "fixtures", "report-card-sample.pdf");
const GOLDEN_UDISE = "11050300101";

if (!fs.existsSync(FIXTURE_PDF)) {
  console.error("Missing fixture PDF:", FIXTURE_PDF);
  process.exit(1);
}

const tmpRoot = fs.mkdtempSync(path.join(path.dirname(FIXTURE_PDF), "capture-api-"));
const pdfsDir = path.join(tmpRoot, "pdfs");
const extractionsDir = path.join(tmpRoot, "extractions");
const screenshotsDir = path.join(tmpRoot, "screenshots");
fs.mkdirSync(pdfsDir, { recursive: true });
fs.mkdirSync(extractionsDir, { recursive: true });
fs.mkdirSync(screenshotsDir, { recursive: true });
fs.copyFileSync(FIXTURE_PDF, path.join(pdfsDir, `${GOLDEN_UDISE}.pdf`));

const dbPath = path.join(tmpRoot, "capture.db");
const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
process.env.DATABASE_URL = dbUrl;

execSync("npx prisma db push --skip-generate", {
  cwd: apiRoot,
  env: { ...process.env, DATABASE_URL: dbUrl },
  stdio: "pipe",
});

const { clearEnvCacheForTests } = await import("../src/config/env.js");
const { resetPrismaForTests } = await import("../src/shared/prisma.js");
clearEnvCacheForTests();
await resetPrismaForTests();

const { getPrisma } = await import("../src/shared/prisma.js");
const prisma = getPrisma();
const job = await prisma.importJob.create({
  data: { status: "RUNNING", startedAt: new Date(), forceReextract: true },
});
const { executePdfImportJob } = await import("../src/modules/import/ingest.service.js");
await executePdfImportJob(job.id, {
  paths: { pdfsDir, extractionsDir, screenshotsDir, schoolsJson: undefined },
  repoRoot: tmpRoot,
  force: true,
});

const { buildApp } = await import("../src/app.js");
const app = await buildApp();
const res = await app.inject({ method: "GET", url: `/api/schools/${GOLDEN_UDISE}` });
const body = res.json();

const outPath = path.join(apiRoot, "test", "fixtures", "acceptance-get-school-detail.response.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      source:
        "Temporary SQLite + executePdfImportJob(report-card-sample.pdf as 11050300101.pdf); GET /api/schools/:udise via app.inject",
      request: `GET /api/schools/${GOLDEN_UDISE}`,
      statusCode: res.statusCode,
      udise: GOLDEN_UDISE,
      body,
    },
    null,
    2,
  ),
  "utf8",
);
console.log("Wrote", outPath, "HTTP", res.statusCode);
await app.close();
await prisma.$disconnect();
try {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch {
  /* ignore */
}
