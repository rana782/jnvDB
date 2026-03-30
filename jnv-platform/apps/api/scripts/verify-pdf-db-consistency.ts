/**
 * Parse every discovered PDF and compare parsed section values with DB rows.
 * Optional --fix writes parsed values back for mismatched schools.
 *
 * Usage:
 *   npm run verify:pdf-db -w @jnv/api
 *   npm run verify:pdf-db -w @jnv/api -- --fix
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { getPrisma } from "../src/shared/prisma.js";
import { loadEnv } from "../src/config/env.js";
import { resolveScrapedDataPaths } from "../src/config/paths.js";
import { buildPdfInventory } from "../src/modules/import/pdf-inventory.js";
import { extractPdfText, parseReportCardText } from "../src/modules/import/pdf-extract.js";
import {
  ENROLMENT_AGE_BAND,
  ENROLMENT_MINORITY_CATEGORY,
  ENROLMENT_OTHERS_CATEGORY,
} from "../src/modules/import/report-card-normalized.js";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(API_ROOT, "reports");
const REPORT_JSON = path.join(REPORT_DIR, "pdf-db-consistency.json");
const fixMode = process.argv.includes("--fix");

type SectionDiff = {
  section: string;
  details: string[];
};

type SchoolDiff = {
  udise: string;
  pdfPath: string;
  diffs: SectionDiff[];
  fixed: boolean;
};

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mapFromRows(rows: { category?: string | null; ageBand?: string | null; total: number | null }[]): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (const r of rows) {
    const key = r.category ?? r.ageBand ?? "";
    if (!key) continue;
    m.set(key, n(r.total));
  }
  return m;
}

function compareExpectedMap(
  section: string,
  expected: Record<string, number | null>,
  actual: Map<string, number | null>,
): SectionDiff | null {
  const details: string[] = [];
  for (const [label, exp] of Object.entries(expected)) {
    if (exp == null) continue;
    const got = actual.get(label) ?? null;
    if (got !== exp) details.push(`${label}: expected ${exp}, db ${got ?? "null"}`);
  }
  return details.length > 0 ? { section, details } : null;
}

async function main() {
  const env = loadEnv();
  const paths = resolveScrapedDataPaths(env);
  const inventory = await buildPdfInventory(paths.pdfsDir, true);
  const prisma = getPrisma();

  const udises = [...inventory.udiseToPdfPath.keys()].sort((a, b) => a.localeCompare(b));
  const schools = await prisma.school.findMany({
    where: { udise: { in: udises } },
    select: {
      udise: true,
      totalStudents: true,
      totalBoys: true,
      totalGirls: true,
      geographicState: true,
      geographicDistrict: true,
      enrolmentSocial: { select: { category: true, total: true } },
      enrolmentMinority: { select: { category: true, total: true } },
      enrolmentOthers: { select: { category: true, total: true } },
      enrolmentAge: { select: { ageBand: true, total: true } },
    },
  });
  const byUdise = new Map(schools.map((s) => [s.udise, s]));

  const diffs: SchoolDiff[] = [];
  let parsed = 0;
  let fixed = 0;
  let missingSchoolRows = 0;
  let parsedWithStudents = 0;
  let parsedWithSocialTotal = 0;
  let parsedWithMinorityTotal = 0;
  let parsedWithAgeTotal = 0;

  for (const udise of udises) {
    const pdfPath = inventory.udiseToPdfPath.get(udise)!;
    const school = byUdise.get(udise);
    if (!school) {
      missingSchoolRows++;
      continue;
    }
    const buf = await fsPromises.readFile(pdfPath);
    const extracted = await extractPdfText(buf);
    const parsedData = parseReportCardText(extracted.text, udise);
    parsed++;
    if ((parsedData.students?.total ?? 0) > 0) parsedWithStudents++;
    if ((parsedData.enrolmentSocial?.total ?? 0) > 0) parsedWithSocialTotal++;
    if ((parsedData.enrolmentMinority?.total ?? 0) > 0) parsedWithMinorityTotal++;
    if ((parsedData.enrolmentAge?.total ?? 0) > 0) parsedWithAgeTotal++;

    const schoolDiffs: SectionDiff[] = [];
    const expectedTotal = n(parsedData.students?.total) ?? n(parsedData.enrolmentSocial?.total);
    const expectedBoys = n(parsedData.students?.boys);
    const expectedGirls = n(parsedData.students?.girls);

    const scalarDetails: string[] = [];
    if (expectedTotal != null && school.totalStudents !== expectedTotal) {
      scalarDetails.push(`totalStudents expected ${expectedTotal}, db ${school.totalStudents ?? "null"}`);
    }
    if (expectedBoys != null && school.totalBoys !== expectedBoys) {
      scalarDetails.push(`totalBoys expected ${expectedBoys}, db ${school.totalBoys ?? "null"}`);
    }
    if (expectedGirls != null && school.totalGirls !== expectedGirls) {
      scalarDetails.push(`totalGirls expected ${expectedGirls}, db ${school.totalGirls ?? "null"}`);
    }
    if (scalarDetails.length > 0) schoolDiffs.push({ section: "school", details: scalarDetails });

    if (parsedData.enrolmentSocial) {
      const expectedSocial = {
        SC: n(parsedData.enrolmentSocial.sc),
        ST: n(parsedData.enrolmentSocial.st),
        OBC: n(parsedData.enrolmentSocial.obc),
        General: n(parsedData.enrolmentSocial.general),
        Total: n(parsedData.enrolmentSocial.total),
      };
      const d = compareExpectedMap("enrolmentSocial", expectedSocial, mapFromRows(school.enrolmentSocial));
      if (d) schoolDiffs.push(d);
    }

    if (parsedData.enrolmentMinority) {
      const expected: Record<string, number | null> = {};
      for (const [key, label] of Object.entries(ENROLMENT_MINORITY_CATEGORY)) {
        expected[label] = n(parsedData.enrolmentMinority[key as keyof typeof parsedData.enrolmentMinority]);
      }
      const d = compareExpectedMap("enrolmentMinority", expected, mapFromRows(school.enrolmentMinority));
      if (d) schoolDiffs.push(d);
    }

    if (parsedData.enrolmentOthers) {
      const expected: Record<string, number | null> = {};
      for (const [key, label] of Object.entries(ENROLMENT_OTHERS_CATEGORY)) {
        expected[label] = n(parsedData.enrolmentOthers[key as keyof typeof parsedData.enrolmentOthers]);
      }
      const d = compareExpectedMap("enrolmentOthers", expected, mapFromRows(school.enrolmentOthers));
      if (d) schoolDiffs.push(d);
    }

    if (parsedData.enrolmentAge) {
      const expected: Record<string, number | null> = {};
      for (const [key, label] of Object.entries(ENROLMENT_AGE_BAND)) {
        expected[label] = n(parsedData.enrolmentAge[key as keyof typeof parsedData.enrolmentAge]);
      }
      const d = compareExpectedMap("enrolmentAge", expected, mapFromRows(school.enrolmentAge));
      if (d) schoolDiffs.push(d);
    }

    let didFix = false;
    if (fixMode && schoolDiffs.length > 0) {
      await prisma.$transaction(async (tx) => {
        const data: Record<string, unknown> = {};
        if (expectedTotal != null) data.totalStudents = expectedTotal;
        if (expectedBoys != null) data.totalBoys = expectedBoys;
        if (expectedGirls != null) data.totalGirls = expectedGirls;
        if (Object.keys(data).length > 0) {
          await tx.school.update({ where: { udise }, data });
        }
      });
      didFix = true;
      fixed++;
    }

    if (schoolDiffs.length > 0) {
      diffs.push({
        udise,
        pdfPath,
        diffs: schoolDiffs,
        fixed: didFix,
      });
    }
    if (parsed % 50 === 0) {
      console.log(`verified ${parsed}/${udises.length} PDFs...`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: fixMode ? "verify+fix" : "verify",
    pdfFiles: udises.length,
    parsed,
    missingSchoolRows,
    parserCoverage: {
      studentsTotalGt0: parsedWithStudents,
      socialTotalGt0: parsedWithSocialTotal,
      minorityTotalGt0: parsedWithMinorityTotal,
      ageTotalGt0: parsedWithAgeTotal,
    },
    mismatchedSchools: diffs.length,
    fixedSchools: fixed,
    sample: diffs.slice(0, 50),
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n=== PDF -> DB consistency report ===\n${JSON.stringify(report, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

