import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  extractEnrolmentAgeFromReportCard,
  extractEnrolmentMinorityFromReportCard,
  extractEnrolmentSocialFromReportCard,
  extractPdfText,
  parseReportCardText,
} from "./pdf-extract.js";
import type { ReportCardNormalized } from "./report-card-normalized.js";
import { ENROLMENT_AGE_BAND, ENROLMENT_MINORITY_CATEGORY } from "./report-card-normalized.js";
import {
  PROFILE_COMPLETENESS_WEIGHTS,
  computeProfileCompletenessFromSnapshot,
} from "../analytics/derived-metrics.js";
import type { SchoolDetailRow } from "../schools/school.dto.js";
import { schoolDetailInclude } from "../schools/school.dto.js";
import { clearEnvCacheForTests } from "../../config/env.js";
import { resetPrismaForTests } from "../../shared/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** apps/api (package root; prisma CLI cwd) */
const API_ROOT = path.resolve(__dirname, "..", "..", "..");
const FIXTURE_PDF = path.join(API_ROOT, "test", "fixtures", "report-card-sample.pdf");
/** Restore after tmp DB teardown so other integration tests use dev.db. */
const DEFAULT_DEV_DB_URL = `file:${path.join(API_ROOT, "prisma", "dev.db").replace(/\\/g, "/")}`;

const GOLDEN_UDISE = "11050300101";
const GOLDEN_SOCIAL = { sc: 120, st: 45, obc: 200, general: 80, total: 445 } as const;

const GOLDEN_MINORITY = {
  muslim: 60,
  christian: 12,
  sikh: 8,
  buddhist: 4,
  jain: 1,
  others: 20,
  total: 105,
} as const;

const GOLDEN_AGE = {
  age_10: 50,
  age_11: 50,
  age_12: 50,
  age_13: 50,
  age_14: 49,
  age_15: 49,
  age_16: 49,
  age_17: 49,
  age_18: 49,
  total: 445,
} as const;

const GOLDEN_STUDENTS = { total: 445, boys: 220, girls: 225 } as const;

/** Fixture has social, minority, age, and headcount; no others/infra/digital rows from PDF. */
const EXPECTED_COMPLETENESS =
  PROFILE_COMPLETENESS_WEIGHTS.social +
  PROFILE_COMPLETENESS_WEIGHTS.minority +
  PROFILE_COMPLETENESS_WEIGHTS.age +
  PROFILE_COMPLETENESS_WEIGHTS.studentTotals;

type Social = ReportCardNormalized["enrolmentSocial"];
type Minority = ReportCardNormalized["enrolmentMinority"];
type Age = ReportCardNormalized["enrolmentAge"];

function fail(ctx: string, msg: string): never {
  throw new Error(`ASSERTION FAILED [${ctx}]: ${msg}`);
}

function assertSocialMatchesExtracted(ctx: string, e: Social): void {
  for (const key of ["sc", "st", "obc", "general", "total"] as const) {
    const v = e[key];
    if (v != null && (typeof v !== "number" || !Number.isFinite(v))) {
      fail(ctx, `${key} must be a finite number or null, got ${JSON.stringify(v)}`);
    }
  }
  if (e.sc !== GOLDEN_SOCIAL.sc) fail(ctx, `SC: expected ${GOLDEN_SOCIAL.sc}, got ${e.sc}`);
  if (e.st !== GOLDEN_SOCIAL.st) fail(ctx, `ST: expected ${GOLDEN_SOCIAL.st}, got ${e.st}`);
  if (e.obc !== GOLDEN_SOCIAL.obc) fail(ctx, `OBC: expected ${GOLDEN_SOCIAL.obc}, got ${e.obc}`);
  if (e.general !== GOLDEN_SOCIAL.general) {
    fail(ctx, `General: expected ${GOLDEN_SOCIAL.general}, got ${e.general}`);
  }
  if (e.total !== GOLDEN_SOCIAL.total) fail(ctx, `Total: expected ${GOLDEN_SOCIAL.total}, got ${e.total}`);
  const sum = (e.sc ?? 0) + (e.st ?? 0) + (e.obc ?? 0) + (e.general ?? 0);
  if (e.total != null && e.total !== sum) {
    fail(ctx, `Total ${e.total} does not equal SC+ST+OBC+General (${sum})`);
  }
}

function assertMinorityMatches(ctx: string, m: Minority): void {
  for (const key of Object.keys(GOLDEN_MINORITY) as (keyof typeof GOLDEN_MINORITY)[]) {
    const v = m[key];
    const exp = GOLDEN_MINORITY[key];
    if (v !== exp) fail(ctx, `${key}: expected ${exp}, got ${v}`);
  }
}

function assertAgeMatches(ctx: string, a: Age): void {
  for (const key of Object.keys(GOLDEN_AGE) as (keyof typeof GOLDEN_AGE)[]) {
    const v = a[key];
    const exp = GOLDEN_AGE[key];
    if (v !== exp) fail(ctx, `${key}: expected ${exp}, got ${v}`);
  }
  const sum =
    (a.age_10 ?? 0) +
    (a.age_11 ?? 0) +
    (a.age_12 ?? 0) +
    (a.age_13 ?? 0) +
    (a.age_14 ?? 0) +
    (a.age_15 ?? 0) +
    (a.age_16 ?? 0) +
    (a.age_17 ?? 0) +
    (a.age_18 ?? 0);
  if (a.total != null && sum !== a.total) {
    fail(ctx, `Age total ${a.total} does not equal sum of bands (${sum})`);
  }
}

describe("report-card PDF fixture (repo)", () => {
  it("fails loudly if fixture PDF is missing", () => {
    if (!fs.existsSync(FIXTURE_PDF)) {
      throw new Error(
        `MISSING PDF FIXTURE: ${FIXTURE_PDF}\n` +
          "Generate it from apps/api with: node scripts/generate-report-card-test-pdf.mjs",
      );
    }
  });

  it("extractPdfText yields text; social / minority / age extractors match golden fixture", async () => {
    if (!fs.existsSync(FIXTURE_PDF)) {
      throw new Error(`MISSING PDF FIXTURE: ${FIXTURE_PDF}`);
    }
    const buffer = fs.readFileSync(FIXTURE_PDF);
    const extracted = await extractPdfText(buffer);
    if (extracted.text.length < 80) {
      fail("extractPdfText", `text too short: ${extracted.text.length}`);
    }

    const { enrolmentSocial, enrolmentSocialConfidence } = extractEnrolmentSocialFromReportCard(extracted.text);
    assertSocialMatchesExtracted("extractEnrolmentSocialFromReportCard", enrolmentSocial);
    if (enrolmentSocialConfidence <= 0 || enrolmentSocialConfidence > 0.95) {
      fail("social confidence", `expected (0, 0.95], got ${enrolmentSocialConfidence}`);
    }

    const { enrolmentMinority, enrolmentMinorityConfidence } =
      extractEnrolmentMinorityFromReportCard(extracted.text);
    assertMinorityMatches("extractEnrolmentMinorityFromReportCard", enrolmentMinority);
    if (enrolmentMinorityConfidence <= 0 || enrolmentMinorityConfidence > 0.95) {
      fail("minority confidence", `expected (0, 0.95], got ${enrolmentMinorityConfidence}`);
    }

    const { enrolmentAge, enrolmentAgeConfidence } = extractEnrolmentAgeFromReportCard(extracted.text);
    assertAgeMatches("extractEnrolmentAgeFromReportCard", enrolmentAge);
    if (enrolmentAgeConfidence <= 0 || enrolmentAgeConfidence > 0.95) {
      fail("age confidence", `expected (0, 0.95], got ${enrolmentAgeConfidence}`);
    }
  });

  it("parseReportCardText attaches social, minority, age, and student headcount", async () => {
    if (!fs.existsSync(FIXTURE_PDF)) {
      throw new Error(`MISSING PDF FIXTURE: ${FIXTURE_PDF}`);
    }
    const buffer = fs.readFileSync(FIXTURE_PDF);
    const extracted = await extractPdfText(buffer);
    const parsed = parseReportCardText(extracted.text, GOLDEN_UDISE);
    if (!parsed.enrolmentSocial) fail("parse", "missing enrolmentSocial");
    assertSocialMatchesExtracted("parseReportCardText.social", parsed.enrolmentSocial);
    if (!parsed.enrolmentMinority) fail("parse", "missing enrolmentMinority");
    assertMinorityMatches("parseReportCardText.minority", parsed.enrolmentMinority);
    if (!parsed.enrolmentAge) fail("parse", "missing enrolmentAge");
    assertAgeMatches("parseReportCardText.age", parsed.enrolmentAge);
    if (!parsed.students) fail("parse", "missing students");
    if (parsed.students.total !== GOLDEN_STUDENTS.total) {
      fail("parse.students", `total expected ${GOLDEN_STUDENTS.total}, got ${parsed.students.total}`);
    }
    if (parsed.students.boys !== GOLDEN_STUDENTS.boys) {
      fail("parse.students", `boys expected ${GOLDEN_STUDENTS.boys}, got ${parsed.students.boys}`);
    }
    if (parsed.students.girls !== GOLDEN_STUDENTS.girls) {
      fail("parse.students", `girls expected ${GOLDEN_STUDENTS.girls}, got ${parsed.students.girls}`);
    }
  });
});

describe("ingest + DB + API + completeness (real PDF fixture)", () => {
  let tmpRoot: string;
  let dbPath: string;
  let dbUrl: string;

  beforeAll(async () => {
    if (!fs.existsSync(FIXTURE_PDF)) {
      throw new Error(`MISSING PDF FIXTURE: ${FIXTURE_PDF}`);
    }
    tmpRoot = fs.mkdtempSync(path.join(path.dirname(FIXTURE_PDF), "pdf-import-"));
    const pdfsDir = path.join(tmpRoot, "pdfs");
    const extractionsDir = path.join(tmpRoot, "extractions");
    const screenshotsDir = path.join(tmpRoot, "screenshots");
    fs.mkdirSync(pdfsDir, { recursive: true });
    fs.mkdirSync(extractionsDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });
    fs.copyFileSync(FIXTURE_PDF, path.join(pdfsDir, `${GOLDEN_UDISE}.pdf`));

    dbPath = path.join(tmpRoot, "ingest-test.db");
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
      throw new Error(`Import job reported errors: ${JSON.stringify(errs, null, 2)}`);
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

  it("DB: SchoolEnrolmentSocial rows match golden categories and totals", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const rows = await prisma.schoolEnrolmentSocial.findMany({
      where: { udise: GOLDEN_UDISE },
      orderBy: { category: "asc" },
    });
    const map = Object.fromEntries(rows.map((r) => [r.category, r.total])) as Record<string, number | null>;
    if (rows.length === 0) fail("DB social", "no SchoolEnrolmentSocial rows");
    expect(map["SC"]).toBe(GOLDEN_SOCIAL.sc);
    expect(map["ST"]).toBe(GOLDEN_SOCIAL.st);
    expect(map["OBC"]).toBe(GOLDEN_SOCIAL.obc);
    expect(map["General"]).toBe(GOLDEN_SOCIAL.general);
    expect(map["Total"]).toBe(GOLDEN_SOCIAL.total);
  });

  it("DB: SchoolEnrolmentMinority rows match golden minority extraction", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const rows = await prisma.schoolEnrolmentMinority.findMany({
      where: { udise: GOLDEN_UDISE },
      orderBy: { category: "asc" },
    });
    if (rows.length === 0) fail("DB minority", "no SchoolEnrolmentMinority rows");
    const map = Object.fromEntries(rows.map((r) => [r.category, r.total])) as Record<string, number | null>;
    for (const key of Object.keys(GOLDEN_MINORITY) as (keyof typeof GOLDEN_MINORITY)[]) {
      const label = ENROLMENT_MINORITY_CATEGORY[key];
      const exp = GOLDEN_MINORITY[key];
      if (map[label] !== exp) {
        fail("DB minority", `${label}: expected ${exp}, got ${map[label]}`);
      }
    }
  });

  it("DB: SchoolEnrolmentAge rows match golden age distribution", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const rows = await prisma.schoolEnrolmentAge.findMany({
      where: { udise: GOLDEN_UDISE },
      orderBy: { ageBand: "asc" },
    });
    if (rows.length === 0) fail("DB age", "no SchoolEnrolmentAge rows");
    const map = Object.fromEntries(rows.map((r) => [r.ageBand, r.total])) as Record<string, number | null>;
    for (const key of Object.keys(GOLDEN_AGE) as (keyof typeof GOLDEN_AGE)[]) {
      const band = ENROLMENT_AGE_BAND[key];
      const exp = GOLDEN_AGE[key];
      if (map[band] !== exp) {
        fail("DB age", `${band}: expected ${exp}, got ${map[band]}`);
      }
    }
  });

  it("DB: School headcount and stored completeness match pipeline expectations", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const school = await prisma.school.findUnique({ where: { udise: GOLDEN_UDISE } });
    if (!school) fail("DB school", "School row missing after ingest");
    if (school.totalStudents !== GOLDEN_STUDENTS.total) {
      fail("DB school", `totalStudents expected ${GOLDEN_STUDENTS.total}, got ${school.totalStudents}`);
    }
    if (school.totalBoys !== GOLDEN_STUDENTS.boys) {
      fail("DB school", `totalBoys expected ${GOLDEN_STUDENTS.boys}, got ${school.totalBoys}`);
    }
    if (school.totalGirls !== GOLDEN_STUDENTS.girls) {
      fail("DB school", `totalGirls expected ${GOLDEN_STUDENTS.girls}, got ${school.totalGirls}`);
    }
    const pct = school.profileCompletenessPct;
    if (pct == null || !Number.isFinite(pct)) {
      fail("DB completeness", `profileCompletenessPct missing or invalid: ${pct}`);
    }
    if (Math.round(pct) !== EXPECTED_COMPLETENESS) {
      fail(
        "DB completeness",
        `expected ${EXPECTED_COMPLETENESS} from weights (social+minority+age+students), got ${pct}`,
      );
    }
  });

  it("computeProfileCompletenessFromSnapshot matches stored profileCompletenessPct for ingested rows", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const row = await prisma.school.findUnique({
      where: { udise: GOLDEN_UDISE },
      include: schoolDetailInclude,
    });
    if (!row) fail("completeness fn", "school missing");
    const r = row as SchoolDetailRow;
    const computed = computeProfileCompletenessFromSnapshot({
      totalStudents: r.totalStudents,
      totalBoys: r.totalBoys,
      totalGirls: r.totalGirls,
      waterAvailable: r.waterAvailable,
      electricityAvailable: r.electricityAvailable,
      internetAvailable: r.internetAvailable,
      solarAvailable: r.solarAvailable,
      playgroundAvailable: r.playgroundAvailable,
      libraryAvailable: r.libraryAvailable,
      enrolmentSocial: r.enrolmentSocial.map((x) => ({
        total: x.total,
        boys: x.boys,
        girls: x.girls,
      })),
      enrolmentMinority: r.enrolmentMinority.map((x) => ({
        total: x.total,
        boys: x.boys,
        girls: x.girls,
      })),
      enrolmentOthers: r.enrolmentOthers.map((x) => ({
        total: x.total,
        boys: x.boys,
        girls: x.girls,
      })),
      enrolmentAge: r.enrolmentAge.map((x) => ({
        total: x.total,
        boys: x.boys,
        girls: x.girls,
      })),
      infra: r.infra,
      digital: r.digital,
    });
    if (computed !== EXPECTED_COMPLETENESS) {
      fail(
        "completeness fn",
        `computeProfileCompletenessFromSnapshot got ${computed}, expected ${EXPECTED_COMPLETENESS}`,
      );
    }
    if (Math.round(r.profileCompletenessPct ?? 0) !== computed) {
      fail(
        "completeness fn",
        `DB profileCompletenessPct ${r.profileCompletenessPct} !== recomputed ${computed}`,
      );
    }
  });

  it("GET /api/schools/:udise response structure and chart DTOs match DB golden values", async () => {
    process.env.DATABASE_URL = dbUrl;
    clearEnvCacheForTests();
    await resetPrismaForTests();
    const { buildApp } = await import("../../app.js");
    const app = await buildApp();
    try {
      const res = await app.inject({ method: "GET", url: `/api/schools/${GOLDEN_UDISE}` });
      if (res.statusCode !== 200) {
        fail("API", `expected 200, got ${res.statusCode}: ${res.body}`);
      }
      const body = res.json() as {
        school: {
          udise: string;
          profileCompletenessPct: number | null;
          enrolmentHeadcount: { totalStudents: number | null; totalBoys: number | null; totalGirls: number | null };
        };
        enrolmentSocial: { category: string; total: number | null; chartValue: number }[];
        enrolmentMinority: { category: string; total: number | null; chartValue: number }[];
        enrolmentOthers: unknown[];
        enrolmentAge: { ageBand: string; total: number | null; chartValue: number }[];
        pdfPath: string | null;
        extractionConfidence: number | null;
      };
      if (!body.school || body.school.udise !== GOLDEN_UDISE) {
        fail("API", `bad school: ${JSON.stringify(body.school?.udise)}`);
      }
      for (const key of ["enrolmentSocial", "enrolmentMinority", "enrolmentOthers", "enrolmentAge"] as const) {
        if (!Array.isArray(body[key])) fail("API", `${key} must be an array`);
      }
      if (!("pdfPath" in body) || !("extractionConfidence" in body)) {
        fail("API", "missing pdfPath or extractionConfidence");
      }
      if (body.extractionConfidence == null) fail("API", "extractionConfidence null");
      if (body.pdfPath == null || String(body.pdfPath).length < 1) fail("API", "pdfPath empty");

      const assertChartRows = (
        ctx: string,
        rows: { category?: string; ageBand?: string; total: number | null; chartValue: number }[],
        key: "category" | "ageBand",
        expected: Record<string, number>,
      ) => {
        for (const r of rows) {
          if (typeof r.chartValue !== "number" || !Number.isFinite(r.chartValue)) {
            fail(ctx, "chartValue must be finite number");
          }
          const k = key === "category" ? r.category : r.ageBand;
          if (!k) fail(ctx, "missing category/ageBand");
        }
        const map = Object.fromEntries(
          rows.map((r) => [(key === "category" ? r.category : r.ageBand) as string, r.total]),
        );
        for (const [label, exp] of Object.entries(expected)) {
          if (map[label] !== exp) fail(ctx, `${label}: expected total ${exp}, got ${map[label]}`);
        }
      };

      const socialExpected: Record<string, number> = {
        SC: GOLDEN_SOCIAL.sc,
        ST: GOLDEN_SOCIAL.st,
        OBC: GOLDEN_SOCIAL.obc,
        General: GOLDEN_SOCIAL.general,
        Total: GOLDEN_SOCIAL.total,
      };
      assertChartRows("API social", body.enrolmentSocial, "category", socialExpected);

      const minorityExpected: Record<string, number> = {};
      for (const k of Object.keys(GOLDEN_MINORITY) as (keyof typeof GOLDEN_MINORITY)[]) {
        minorityExpected[ENROLMENT_MINORITY_CATEGORY[k]] = GOLDEN_MINORITY[k];
      }
      assertChartRows("API minority", body.enrolmentMinority, "category", minorityExpected);

      const ageExpected: Record<string, number> = {};
      for (const k of Object.keys(GOLDEN_AGE) as (keyof typeof GOLDEN_AGE)[]) {
        ageExpected[ENROLMENT_AGE_BAND[k]] = GOLDEN_AGE[k];
      }
      assertChartRows("API age", body.enrolmentAge, "ageBand", ageExpected);

      if (body.school.enrolmentHeadcount.totalStudents !== GOLDEN_STUDENTS.total) {
        fail(
          "API headcount",
          `totalStudents ${body.school.enrolmentHeadcount.totalStudents} !== ${GOLDEN_STUDENTS.total}`,
        );
      }
      if (Math.round(body.school.profileCompletenessPct ?? -1) !== EXPECTED_COMPLETENESS) {
        fail(
          "API completeness",
          `profileCompletenessPct expected ~${EXPECTED_COMPLETENESS}, got ${body.school.profileCompletenessPct}`,
        );
      }
    } finally {
      await app.close();
    }
  });
});
