import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as PdfExtractMod from "./pdf-extract.js";
import * as IngestMod from "./ingest.service.js";
import {
  extractDigitalFromReportCard,
  extractEnrolmentAgeFromReportCard,
  extractEnrolmentMinorityFromReportCard,
  extractEnrolmentOthersFromReportCard,
  extractEnrolmentSocialFromReportCard,
  extractPdfText,
  extractTeachersFromReportCard,
  parseReportCardText,
} from "./pdf-extract.js";
import type { ReportCardNormalized } from "./report-card-normalized.js";
import {
  ENROLMENT_AGE_BAND,
  ENROLMENT_MINORITY_CATEGORY,
  ENROLMENT_OTHERS_CATEGORY,
} from "./report-card-normalized.js";
import { REPORT_CARD_PARSER_VERSION } from "./parser/constants.js";
import type { ReportCardSnapshotPayload } from "./report-card-extraction-payload.js";
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

const GOLDEN_OTHERS = {
  bpl: 12,
  repeater: 5,
  cwsn: 3,
  ews: 42,
  otherCategories: 8,
  total: 70,
} as const;

const GOLDEN_DIGITAL = {
  desktops: 40,
  laptops: 8,
  tablets: 12,
  printers: 6,
  smartClassTv: 5,
  projectors: 4,
} as const;

const GOLDEN_TEACHERS = {
  total: 28,
  male: 16,
  female: 12,
  trained: 22,
  untrained: 6,
} as const;

/** All weighted blocks present on the expanded fixture PDF. */
const EXPECTED_COMPLETENESS =
  PROFILE_COMPLETENESS_WEIGHTS.social +
  PROFILE_COMPLETENESS_WEIGHTS.minority +
  PROFILE_COMPLETENESS_WEIGHTS.others +
  PROFILE_COMPLETENESS_WEIGHTS.age +
  PROFILE_COMPLETENESS_WEIGHTS.studentTotals +
  PROFILE_COMPLETENESS_WEIGHTS.infra +
  PROFILE_COMPLETENESS_WEIGHTS.digital;

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

  it("section extractors match digital, teachers, others, and academic year on fixture PDF", async () => {
    if (!fs.existsSync(FIXTURE_PDF)) {
      throw new Error(`MISSING PDF FIXTURE: ${FIXTURE_PDF}`);
    }
    const buffer = fs.readFileSync(FIXTURE_PDF);
    const extracted = await extractPdfText(buffer);
    const { digital } = extractDigitalFromReportCard(extracted.text);
    for (const k of Object.keys(GOLDEN_DIGITAL) as (keyof typeof GOLDEN_DIGITAL)[]) {
      if (digital[k] !== GOLDEN_DIGITAL[k]) {
        fail("digital", `${k}: expected ${GOLDEN_DIGITAL[k]}, got ${digital[k]}`);
      }
    }
    const { teachers } = extractTeachersFromReportCard(extracted.text);
    for (const k of Object.keys(GOLDEN_TEACHERS) as (keyof typeof GOLDEN_TEACHERS)[]) {
      if (teachers[k] !== GOLDEN_TEACHERS[k]) {
        fail("teachers", `${k}: expected ${GOLDEN_TEACHERS[k]}, got ${teachers[k]}`);
      }
    }
    const { enrolmentOthers } = extractEnrolmentOthersFromReportCard(extracted.text);
    for (const k of Object.keys(GOLDEN_OTHERS) as (keyof typeof GOLDEN_OTHERS)[]) {
      if (enrolmentOthers[k] !== GOLDEN_OTHERS[k]) {
        fail("others", `${k}: expected ${GOLDEN_OTHERS[k]}, got ${enrolmentOthers[k]}`);
      }
    }
    const parsed = parseReportCardText(extracted.text, GOLDEN_UDISE);
    if (parsed.academicYear !== "2024-25") {
      fail("academicYear", `expected 2024-25, got ${parsed.academicYear}`);
    }
  });

  it("parseReportCardText attaches social, minority, age, student headcount, others, digital, teachers", async () => {
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
    if (!parsed.enrolmentOthers) fail("parse", "missing enrolmentOthers");
    for (const k of Object.keys(GOLDEN_OTHERS) as (keyof typeof GOLDEN_OTHERS)[]) {
      if (parsed.enrolmentOthers[k] !== GOLDEN_OTHERS[k]) {
        fail("parse.others", `${k}: expected ${GOLDEN_OTHERS[k]}, got ${parsed.enrolmentOthers[k]}`);
      }
    }
    if (!parsed.digital) fail("parse", "missing digital");
    for (const k of Object.keys(GOLDEN_DIGITAL) as (keyof typeof GOLDEN_DIGITAL)[]) {
      if (parsed.digital[k] !== GOLDEN_DIGITAL[k]) {
        fail("parse.digital", `${k}: expected ${GOLDEN_DIGITAL[k]}, got ${parsed.digital[k]}`);
      }
    }
    if (!parsed.teachers) fail("parse", "missing teachers");
    for (const k of Object.keys(GOLDEN_TEACHERS) as (keyof typeof GOLDEN_TEACHERS)[]) {
      if (parsed.teachers[k] !== GOLDEN_TEACHERS[k]) {
        fail("parse.teachers", `${k}: expected ${GOLDEN_TEACHERS[k]}, got ${parsed.teachers[k]}`);
      }
    }
    if (parsed.academicYear !== "2024-25") fail("parse", "academicYear");
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
        `expected ${EXPECTED_COMPLETENESS} from full fixture weights, got ${pct}`,
      );
    }
  });

  it("DB: SchoolDigitalFacilities matches golden ICT extraction", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const d = await prisma.schoolDigitalFacilities.findUnique({ where: { udise: GOLDEN_UDISE } });
    if (!d) fail("DB digital", "SchoolDigitalFacilities row missing");
    expect(d.desktops).toBe(GOLDEN_DIGITAL.desktops);
    expect(d.laptops).toBe(GOLDEN_DIGITAL.laptops);
    expect(d.tablets).toBe(GOLDEN_DIGITAL.tablets);
    expect(d.printers).toBe(GOLDEN_DIGITAL.printers);
    expect(d.smartClassTv).toBe(GOLDEN_DIGITAL.smartClassTv);
    const extra = d.extra as { projectors?: number } | null;
    expect(extra?.projectors).toBe(GOLDEN_DIGITAL.projectors);
  });

  it("DB: SchoolTeacherBreakdown matches golden teaching staff extraction", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const rows = await prisma.schoolTeacherBreakdown.findMany({
      where: { udise: GOLDEN_UDISE, category: "report_card" },
      orderBy: { label: "asc" },
    });
    if (rows.length < 5) fail("DB teachers", `expected 5 rows, got ${rows.length}`);
    const map = Object.fromEntries(rows.map((r) => [r.label, r.count])) as Record<string, number>;
    expect(map["Female"]).toBe(GOLDEN_TEACHERS.female);
    expect(map["Male"]).toBe(GOLDEN_TEACHERS.male);
    expect(map["Total"]).toBe(GOLDEN_TEACHERS.total);
    expect(map["Trained"]).toBe(GOLDEN_TEACHERS.trained);
    expect(map["Untrained"]).toBe(GOLDEN_TEACHERS.untrained);
  });

  it("DB: SchoolEnrolmentOthers includes BPL, Repeater, CWSN, EWS, and totals", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const rows = await prisma.schoolEnrolmentOthers.findMany({
      where: { udise: GOLDEN_UDISE },
      orderBy: { category: "asc" },
    });
    if (rows.length < 6) fail("DB others", `expected 6 rows, got ${rows.length}`);
    const map = Object.fromEntries(rows.map((r) => [r.category, r.total])) as Record<string, number | null>;
    for (const key of Object.keys(GOLDEN_OTHERS) as (keyof typeof GOLDEN_OTHERS)[]) {
      const label = ENROLMENT_OTHERS_CATEGORY[key];
      const exp = GOLDEN_OTHERS[key];
      if (map[label] !== exp) fail("DB others", `${label}: expected ${exp}, got ${map[label]}`);
    }
  });

  it("DB: SchoolReportCardSnapshot.payload is schema v2 with structured extract + provenance", async () => {
    const { getPrisma } = await import("../../shared/prisma.js");
    const prisma = getPrisma();
    const snap = await prisma.schoolReportCardSnapshot.findUnique({ where: { udise: GOLDEN_UDISE } });
    if (!snap) fail("snapshot", "missing SchoolReportCardSnapshot");
    expect(snap.academicYear).toBe("2024-25");
    const payload = snap.payload as unknown as ReportCardSnapshotPayload;
    if (payload.schemaVersion !== 2) fail("payload", `schemaVersion expected 2, got ${payload.schemaVersion}`);
    expect(payload.provenance.sourcePdfHash).toBe(snap.sourcePdfHash);
    expect(payload.provenance.parserVersion).toBe(REPORT_CARD_PARSER_VERSION);
    expect(payload.provenance.pdfRelativePath).toContain(`${GOLDEN_UDISE}.pdf`);
    expect(payload.provenance.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.confidenceBySection.enrolmentSocial).toBe(payload.structured.enrolmentSocialConfidence);
    expect(payload.structured.digital?.smartClassTv).toBe(GOLDEN_DIGITAL.smartClassTv);
    expect(payload.structured.teachers?.total).toBe(GOLDEN_TEACHERS.total);
    expect(payload.structured.enrolmentOthers?.cwsn).toBe(GOLDEN_OTHERS.cwsn);
    expect(payload.sectionProvenance.digital?.lineIndex).not.toBeNull();
    expect(payload.sectionProvenance.teachers?.lineIndex).not.toBeNull();
    expect(payload.sectionProvenance.enrolmentOthers?.lineIndex).not.toBeNull();
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
    const spyExtractPdfText = vi.spyOn(PdfExtractMod, "extractPdfText");
    const spyExtractReportCard = vi.spyOn(PdfExtractMod, "extractReportCard");
    const spyRunPdfImport = vi.spyOn(IngestMod, "runPdfImport");
    try {
      spyExtractPdfText.mockClear();
      spyExtractReportCard.mockClear();
      spyRunPdfImport.mockClear();
      await app.inject({ method: "GET", url: `/api/schools/${GOLDEN_UDISE}` });
      spyExtractPdfText.mockClear();
      spyExtractReportCard.mockClear();
      spyRunPdfImport.mockClear();
      const t0 = Date.now();
      const res = await app.inject({ method: "GET", url: `/api/schools/${GOLDEN_UDISE}` });
      const elapsed = Date.now() - t0;
      expect(elapsed, `GET /api/schools/:udise must respond in <300ms after warm-up (got ${elapsed}ms)`).toBeLessThan(
        300,
      );
      expect(spyExtractPdfText, "School detail must not re-parse PDF (extractPdfText)").not.toHaveBeenCalled();
      expect(spyExtractReportCard, "School detail must not re-parse PDF (extractReportCard)").not.toHaveBeenCalled();
      expect(spyRunPdfImport, "School detail must not trigger import (runPdfImport)").not.toHaveBeenCalled();
      if (res.statusCode !== 200) {
        fail("API", `expected 200, got ${res.statusCode}: ${res.body}`);
      }
      type ChartRow = { category?: string; ageBand?: string; total: number | null; chartValue: number };
      const body = res.json() as {
        school: {
          udise: string;
          profileCompletenessPct: number | null;
          enrolmentHeadcount: { totalStudents: number | null; totalBoys: number | null; totalGirls: number | null };
          chartSeries: { teachers: { category: string; label: string; count: number }[] };
          provenance: { reportSnapshot?: { payload?: ReportCardSnapshotPayload } };
        };
        enrolmentSocial: ChartRow[];
        enrolmentMinority: ChartRow[];
        enrolmentOthers: ChartRow[];
        enrolmentAge: ChartRow[];
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

      const othersExpected: Record<string, number> = {};
      for (const k of Object.keys(GOLDEN_OTHERS) as (keyof typeof GOLDEN_OTHERS)[]) {
        othersExpected[ENROLMENT_OTHERS_CATEGORY[k]] = GOLDEN_OTHERS[k];
      }
      assertChartRows("API others", body.enrolmentOthers, "category", othersExpected);

      const teachersSeries = body.school.chartSeries.teachers as { category: string; label: string; count: number }[];
      if (!Array.isArray(teachersSeries) || teachersSeries.length < 5) {
        fail("API chartSeries.teachers", `expected >= 5 rows, got ${teachersSeries?.length}`);
      }
      const tmap = Object.fromEntries(teachersSeries.map((r) => [r.label, r.count])) as Record<string, number>;
      expect(tmap["Total"]).toBe(GOLDEN_TEACHERS.total);
      expect(tmap["Male"]).toBe(GOLDEN_TEACHERS.male);
      expect(tmap["Female"]).toBe(GOLDEN_TEACHERS.female);
      expect(tmap["Trained"]).toBe(GOLDEN_TEACHERS.trained);
      expect(tmap["Untrained"]).toBe(GOLDEN_TEACHERS.untrained);
      for (const r of teachersSeries) {
        if (r.category !== "report_card") fail("API teachers", `category expected report_card, got ${r.category}`);
      }

      const snapPayload = body.school.provenance.reportSnapshot?.payload;
      if (!snapPayload || snapPayload.schemaVersion !== 2) {
        fail("API reportSnapshot.payload", "missing schema v2 payload on school.provenance.reportSnapshot");
      }
      expect(JSON.stringify(snapPayload).length, "reportSnapshot.payload must not be empty").toBeGreaterThan(80);
      expect(snapPayload.provenance.parserVersion).toBe(REPORT_CARD_PARSER_VERSION);
      expect(snapPayload.structured.teachers?.trained).toBe(GOLDEN_TEACHERS.trained);
    } finally {
      vi.restoreAllMocks();
      await app.close();
    }
  });
});
