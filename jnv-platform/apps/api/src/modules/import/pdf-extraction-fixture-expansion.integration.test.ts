/**
 * Expansion fixtures: second UDISE + regional PDF + bulk batch import (not the golden 11050300101 suite).
 * Golden tests stay in pdf-extraction.integration.test.ts unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearEnvCacheForTests } from "../../config/env.js";
import { resetPrismaForTests } from "../../shared/prisma.js";
import * as PdfExtractMod from "./pdf-extract.js";
import * as IngestMod from "./ingest.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..", "..", "..");
const FIXTURE_GOLDEN = path.join(API_ROOT, "test", "fixtures", "report-card-sample.pdf");
const FIXTURE_SECONDARY = path.join(API_ROOT, "test", "fixtures", "report-card-secondary.pdf");
const FIXTURE_REGIONAL = path.join(API_ROOT, "test", "fixtures", "report-card-regional.pdf");
const DEFAULT_DEV_DB_URL = `file:${path.join(API_ROOT, "prisma", "dev.db").replace(/\\/g, "/")}`;

const EXPANSION_SECOND_UDISE = "21040100801";
const EXPANSION_REGION_UDISE = "09030101501";

const SECOND = {
  total: 318,
  boys: 155,
  girls: 163,
  social: { SC: 88, ST: 35, OBC: 120, General: 75, Total: 318 },
} as const;

const REGION = {
  total: 186,
  boys: 92,
  girls: 94,
  social: { SC: 44, ST: 18, OBC: 78, General: 46, Total: 186 },
} as const;

function fail(ctx: string, msg: string): never {
  throw new Error(`[${ctx}] ${msg}`);
}

describe("Fixture expansion: secondary + regional PDFs (single import job)", () => {
  let tmpRoot: string;
  let dbUrl: string;

  beforeAll(async () => {
    if (!fs.existsSync(FIXTURE_SECONDARY) || !fs.existsSync(FIXTURE_REGIONAL)) {
      throw new Error(
        `MISSING FIXTURE PDFS — run: npm run fixture:pdfs:extra -w @jnv/api\nExpected:\n${FIXTURE_SECONDARY}\n${FIXTURE_REGIONAL}`,
      );
    }
    tmpRoot = fs.mkdtempSync(path.join(path.dirname(FIXTURE_SECONDARY), "pdf-expansion-"));
    const pdfsDir = path.join(tmpRoot, "pdfs");
    const extractionsDir = path.join(tmpRoot, "extractions");
    const screenshotsDir = path.join(tmpRoot, "screenshots");
    fs.mkdirSync(pdfsDir, { recursive: true });
    fs.mkdirSync(extractionsDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });
    fs.copyFileSync(FIXTURE_SECONDARY, path.join(pdfsDir, `${EXPANSION_SECOND_UDISE}.pdf`));
    fs.copyFileSync(FIXTURE_REGIONAL, path.join(pdfsDir, `${EXPANSION_REGION_UDISE}.pdf`));

    const dbPath = path.join(tmpRoot, "expansion.db");
    dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
    process.env.DATABASE_URL = dbUrl;
    clearEnvCacheForTests();
    await resetPrismaForTests();

    execSync("npx prisma db push --skip-generate", {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "pipe",
    });

    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const job = await prisma.importJob.create({
      data: { status: "RUNNING", startedAt: new Date(), forceReextract: true },
    });
    const { executePdfImportJob } = await import("./ingest.service.js");
    await executePdfImportJob(job.id, {
      paths: {
        pdfsDir,
        extractionsDir,
        screenshotsDir,
        schoolsJson: undefined,
      },
      repoRoot: tmpRoot,
      force: true,
    });
    const status = await prisma.importJob.findUnique({ where: { id: job.id } });
    if (status?.errorCount && status.errorCount > 0) {
      const errs = await prisma.importError.findMany({ where: { jobId: job.id } });
      throw new Error(`Expansion import errors: ${JSON.stringify(errs, null, 2)}`);
    }
  }, 120_000);

  afterAll(async () => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.env.DATABASE_URL = DEFAULT_DEV_DB_URL;
    clearEnvCacheForTests();
    await resetPrismaForTests();
  });

  it("DB: two schools with distinct UDISE and no duplicates", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const n = await prisma.school.count();
    if (n !== 2) fail("DB count", `expected 2 schools, got ${n}`);
    const u = await prisma.school.findMany({ select: { udise: true } });
    const set = new Set(u.map((r) => r.udise));
    if (set.size !== 2) fail("DB duplicate udise", JSON.stringify(u));
    expect(set.has(EXPANSION_SECOND_UDISE)).toBe(true);
    expect(set.has(EXPANSION_REGION_UDISE)).toBe(true);
  });

  it("DB: secondary fixture headcount + social totals", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const s = await prisma.school.findUnique({ where: { udise: EXPANSION_SECOND_UDISE } });
    if (!s) fail("DB", "secondary school missing");
    expect(s.totalStudents).toBe(SECOND.total);
    expect(s.totalBoys).toBe(SECOND.boys);
    expect(s.totalGirls).toBe(SECOND.girls);
    expect(s.parsingStatus).toBe("COMPLETE");
    const rows = await prisma.schoolEnrolmentSocial.findMany({ where: { udise: EXPANSION_SECOND_UDISE } });
    const map = Object.fromEntries(rows.map((r) => [r.category, r.total]));
    for (const k of Object.keys(SECOND.social) as (keyof typeof SECOND.social)[]) {
      expect(map[k]).toBe(SECOND.social[k]);
    }
  });

  it("DB: regional fixture headcount + social totals", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const s = await prisma.school.findUnique({ where: { udise: EXPANSION_REGION_UDISE } });
    if (!s) fail("DB", "regional school missing");
    expect(s.totalStudents).toBe(REGION.total);
    expect(s.totalBoys).toBe(REGION.boys);
    expect(s.totalGirls).toBe(REGION.girls);
    const rows = await prisma.schoolEnrolmentSocial.findMany({ where: { udise: EXPANSION_REGION_UDISE } });
    const map = Object.fromEntries(rows.map((r) => [r.category, r.total]));
    for (const k of Object.keys(REGION.social) as (keyof typeof REGION.social)[]) {
      expect(map[k]).toBe(REGION.social[k]);
    }
  });

  it("API: secondary + regional detail — snapshot non-empty, no re-parse, latency", async () => {
    process.env.DATABASE_URL = dbUrl;
    clearEnvCacheForTests();
    await resetPrismaForTests();
    const spyText = vi.spyOn(PdfExtractMod, "extractPdfText");
    const spyCard = vi.spyOn(PdfExtractMod, "extractReportCard");
    const spyRun = vi.spyOn(IngestMod, "runPdfImport");
    const { buildApp } = await import("../../app.js");
    const app = await buildApp();
    try {
      for (const udise of [EXPANSION_SECOND_UDISE, EXPANSION_REGION_UDISE]) {
        spyText.mockClear();
        spyCard.mockClear();
        spyRun.mockClear();
        await app.inject({ method: "GET", url: `/api/schools/${udise}` });
        const t0 = Date.now();
        const res = await app.inject({ method: "GET", url: `/api/schools/${udise}` });
        expect(Date.now() - t0).toBeLessThan(300);
        expect(res.statusCode).toBe(200);
        expect(spyText).not.toHaveBeenCalled();
        expect(spyCard).not.toHaveBeenCalled();
        expect(spyRun).not.toHaveBeenCalled();
        const body = res.json() as {
          school: { provenance: { reportSnapshot?: { payload?: { schemaVersion: number; structured: unknown } } } };
          extractionConfidence: number | null;
        };
        const p = body.school.provenance.reportSnapshot?.payload;
        expect(p?.schemaVersion).toBe(2);
        expect(JSON.stringify(p).length).toBeGreaterThan(80);
        expect(body.extractionConfidence).toBeGreaterThanOrEqual(0.65);
      }
    } finally {
      vi.restoreAllMocks();
      await app.close();
    }
  });

  it("DB: regional SchoolExtractionRaw retains Himachal / Shimla strings (PDF text, not exposed on public detail DTO)", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const row = await prisma.schoolExtractionRaw.findFirst({
      where: { udise: EXPANSION_REGION_UDISE, sectionKey: "full_text" },
    });
    expect(row?.rawText ?? "").toContain("Himachal Pradesh");
    expect(row?.rawText ?? "").toContain("Shimla");
  });

  it("DB: secondary SchoolExtractionRaw retains Assam / Nagaon strings from PDF", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const row = await prisma.schoolExtractionRaw.findFirst({
      where: { udise: EXPANSION_SECOND_UDISE, sectionKey: "full_text" },
    });
    expect(row?.rawText ?? "").toContain("Assam");
    expect(row?.rawText ?? "").toContain("Nagaon");
  });
});

describe("Bulk import sanity: 10 PDFs, distinct UDISE, clean job", () => {
  let tmpRoot: string;
  let dbUrl: string;
  const BATCH_PREFIX = "8800110010";

  beforeAll(async () => {
    if (!fs.existsSync(FIXTURE_GOLDEN)) {
      throw new Error(`MISSING ${FIXTURE_GOLDEN}`);
    }
    tmpRoot = fs.mkdtempSync(path.join(path.dirname(FIXTURE_GOLDEN), "pdf-bulk-"));
    const pdfsDir = path.join(tmpRoot, "pdfs");
    const extractionsDir = path.join(tmpRoot, "extractions");
    const screenshotsDir = path.join(tmpRoot, "screenshots");
    fs.mkdirSync(pdfsDir, { recursive: true });
    fs.mkdirSync(extractionsDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });
    for (let i = 0; i < 10; i++) {
      const udise = `${BATCH_PREFIX}${i}`;
      fs.copyFileSync(FIXTURE_GOLDEN, path.join(pdfsDir, `${udise}.pdf`));
    }

    const dbPath = path.join(tmpRoot, "bulk.db");
    dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
    process.env.DATABASE_URL = dbUrl;
    clearEnvCacheForTests();
    await resetPrismaForTests();

    execSync("npx prisma db push --skip-generate", {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "pipe",
    });

    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const job = await prisma.importJob.create({
      data: { status: "RUNNING", startedAt: new Date(), forceReextract: true },
    });
    const { executePdfImportJob } = await import("./ingest.service.js");
    await executePdfImportJob(job.id, {
      paths: { pdfsDir, extractionsDir, screenshotsDir, schoolsJson: undefined },
      repoRoot: tmpRoot,
      force: true,
    });
    const st = await prisma.importJob.findUnique({ where: { id: job.id } });
    if (st?.errorCount && st.errorCount > 0) {
      const errs = await prisma.importError.findMany({ where: { jobId: job.id } });
      throw new Error(`Bulk import errors: ${JSON.stringify(errs, null, 2)}`);
    }
  }, 180_000);

  afterAll(async () => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.env.DATABASE_URL = DEFAULT_DEV_DB_URL;
    clearEnvCacheForTests();
    await resetPrismaForTests();
  });

  it("DB: exactly 10 schools, 10 unique UDISE, all COMPLETE", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const rows = await prisma.school.findMany({ select: { udise: true, parsingStatus: true } });
    expect(rows.length).toBe(10);
    expect(new Set(rows.map((r) => r.udise)).size).toBe(10);
    for (const r of rows) {
      expect(r.udise.startsWith(BATCH_PREFIX)).toBe(true);
      expect(r.parsingStatus).toBe("COMPLETE");
    }
  });

  it("DB: re-run import without force skips completed hashes (no duplicate rows)", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const { executePdfImportJob } = await import("./ingest.service.js");
    const prisma = getPrisma();
    const before = await prisma.school.count();
    const pdfsDir = path.join(tmpRoot, "pdfs");
    const extractionsDir = path.join(tmpRoot, "extractions");
    const screenshotsDir = path.join(tmpRoot, "screenshots");
    const job = await prisma.importJob.create({
      data: { status: "RUNNING", startedAt: new Date(), forceReextract: false },
    });
    await executePdfImportJob(job.id, {
      paths: { pdfsDir, extractionsDir, screenshotsDir, schoolsJson: undefined },
      repoRoot: tmpRoot,
      force: false,
    });
    const after = await prisma.school.count();
    expect(after).toBe(before);
    expect(after).toBe(10);
  });
});
