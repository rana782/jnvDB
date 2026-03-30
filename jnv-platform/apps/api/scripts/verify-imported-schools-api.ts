/**
 * After bulk import: HTTP-injected checks for every school row (no live server required).
 * Writes JSON report for release gate / founders summary.
 *
 * Usage: npm run verify:api-all -w @jnv/api
 * Env: DATABASE_URL (default prisma dev.db via dotenv), optional API_TEST_BASE=/api
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/shared/prisma.js";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const devDb = path.join(API_ROOT, "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}
const REPORT_DIR = path.join(API_ROOT, "reports");
const REPORT_JSON = path.join(REPORT_DIR, "verification-api.json");

const MOCK_SENTINELS = ["mock-school", "placeholder", "lorem ipsum", "fake-udise"];

type RowFail = {
  udise: string;
  step: string;
  reason: string;
};

type DetailBody = {
  school: {
    udise: string;
    schoolName?: string;
    enrolmentHeadcount: { totalStudents: number | null; totalBoys: number | null; totalGirls: number | null };
    provenance: {
      parsingStatus: string;
      overallExtractionConfidence: number | null;
      reportSnapshot: { extractedAt?: string; payload: unknown } | null;
    };
  };
  enrolmentSocial: { category: string; total: number | null }[];
  enrolmentMinority: { category: string; total: number | null }[];
  enrolmentOthers: { category: string; total: number | null }[];
  enrolmentAge: { ageBand: string; total: number | null }[];
  extractionConfidence: number | null;
  pdfPath: string | null;
};

function assertNoMockJson(text: string): boolean {
  const t = text.toLowerCase();
  return !MOCK_SENTINELS.some((s) => t.includes(s));
}

function socialConsistency(social: DetailBody["enrolmentSocial"], totalStudents: number | null): string | null {
  if (totalStudents == null || social.length === 0) return null;
  const map = Object.fromEntries(social.map((r) => [r.category, r.total]));
  const core = (["SC", "ST", "OBC", "General"] as const)
    .map((k) => map[k])
    .filter((v): v is number => typeof v === "number");
  if (core.length === 0) return null;
  const sum = core.reduce((a, b) => a + b, 0);
  if (sum !== totalStudents) return `social category sum ${sum} !== totalStudents ${totalStudents}`;
  if (map["Total"] != null && map["Total"] !== totalStudents) {
    return `social Total row ${map["Total"]} !== totalStudents ${totalStudents}`;
  }
  return null;
}

function ageConsistency(age: DetailBody["enrolmentAge"], totalStudents: number | null): string | null {
  if (totalStudents == null || age.length === 0) return null;
  const totalRow = age.find((r) => r.ageBand === "Total")?.total;
  if (totalRow != null && totalRow !== totalStudents) {
    return `age Total row ${totalRow} !== totalStudents ${totalStudents}`;
  }
  const bands = age.filter((r) => r.ageBand !== "Total" && r.total != null);
  if (bands.length === 0) return null;
  const sum = bands.reduce((a, r) => a + (r.total ?? 0), 0);
  if (totalRow != null && sum !== totalRow && sum !== totalStudents) {
    return `age band sum ${sum} vs Total row ${totalRow}`;
  }
  return null;
}

function headcountConsistency(
  boys: number | null,
  girls: number | null,
  total: number | null,
): string | null {
  if (total == null) return null;
  const b = boys ?? 0;
  const g = girls ?? 0;
  // Many PDFs expose only overall total in extracted text; treat missing split as unknown (not a hard fail).
  if (total > 0 && b === 0 && g === 0) return null;
  if (boys != null && girls != null && boys + girls !== total) {
    return `boys+girls ${boys + girls} !== total ${total}`;
  }
  return null;
}

async function main() {
  const prisma = getPrisma();
  const schools = await prisma.school.findMany({
    select: { udise: true, schoolName: true, parsingStatus: true, overallExtractionConfidence: true, pdfRelativePath: true },
    orderBy: { udise: "asc" },
  });

  const app = await buildApp();
  const failures: RowFail[] = [];
  let pass = 0;
  let pdfPass = 0;
  let pdfSkip = 0;

  try {
    for (const s of schools) {
      const udise = s.udise;
      const res = await app.inject({ method: "GET", url: `/api/schools/${udise}` });
      if (res.statusCode !== 200) {
        failures.push({ udise, step: "GET /api/schools/:udise", reason: `status ${res.statusCode}` });
        continue;
      }
      const body = res.json() as DetailBody;
      if (!assertNoMockJson(JSON.stringify(body))) {
        failures.push({ udise, step: "mock sentinel", reason: "response body matched mock sentinel" });
        continue;
      }
      if (!body.school?.udise) {
        failures.push({ udise, step: "shape", reason: "missing school.udise" });
        continue;
      }
      if (!Array.isArray(body.enrolmentSocial)) {
        failures.push({ udise, step: "shape", reason: "missing enrolmentSocial" });
        continue;
      }
      if (!Array.isArray(body.enrolmentMinority)) {
        failures.push({ udise, step: "shape", reason: "missing enrolmentMinority" });
        continue;
      }
      if (!Array.isArray(body.enrolmentOthers)) {
        failures.push({ udise, step: "shape", reason: "missing enrolmentOthers" });
        continue;
      }
      if (!Array.isArray(body.enrolmentAge)) {
        failures.push({ udise, step: "shape", reason: "missing enrolmentAge" });
        continue;
      }
      if (body.extractionConfidence == null && body.school.provenance.overallExtractionConfidence == null) {
        if (s.parsingStatus !== "PENDING" && s.parsingStatus !== "FAILED") {
          failures.push({ udise, step: "confidence", reason: "missing extractionConfidence for non-pending school" });
          continue;
        }
      }
      if (!body.pdfPath && s.parsingStatus === "COMPLETE") {
        failures.push({ udise, step: "pdfPath", reason: "COMPLETE school missing pdfPath in API" });
        continue;
      }
      const snap = body.school.provenance.reportSnapshot?.payload;
      if (s.parsingStatus === "COMPLETE" && (snap == null || (typeof snap === "object" && Object.keys(snap as object).length === 0))) {
        failures.push({ udise, step: "snapshot", reason: "COMPLETE school missing empty snapshot payload" });
        continue;
      }

      const { totalStudents, totalBoys, totalGirls } = body.school.enrolmentHeadcount;
      const hc = headcountConsistency(totalBoys, totalGirls, totalStudents);
      if (hc) {
        failures.push({ udise, step: "consistency", reason: hc });
        continue;
      }
      const socErr = socialConsistency(body.enrolmentSocial, totalStudents);
      if (socErr) {
        failures.push({ udise, step: "consistency", reason: socErr });
        continue;
      }
      const ageErr = ageConsistency(body.enrolmentAge, totalStudents);
      if (ageErr) {
        failures.push({ udise, step: "consistency", reason: ageErr });
        continue;
      }

      if (body.pdfPath) {
        const pdfRes = await app.inject({ method: "GET", url: `/api/schools/${udise}/pdf` });
        if (pdfRes.statusCode !== 200) {
          failures.push({ udise, step: "GET /pdf", reason: `status ${pdfRes.statusCode}` });
          continue;
        }
        const ct = pdfRes.headers["content-type"] ?? "";
        if (!ct.includes("application/pdf") && !ct.includes("pdf")) {
          failures.push({ udise, step: "GET /pdf", reason: `content-type ${ct}` });
          continue;
        }
        pdfPass++;
      } else {
        pdfSkip++;
      }

      pass++;
    }

    const listRes = await app.inject({ method: "GET", url: "/api/schools?page=1&pageSize=100" });
    let compareStatus = 200;
    if (schools.length >= 2) {
      const compareRes = await app.inject({
        method: "GET",
        url: `/api/schools/compare?u=${schools[0]!.udise},${schools[1]!.udise}`,
      });
      compareStatus = compareRes.statusCode;
    }
    const mapRes = await app.inject({ method: "GET", url: "/api/dashboard/map" });
    const dashRes = await app.inject({ method: "GET", url: "/api/dashboard/summary" });

    const flowFailures: string[] = [];
    if (listRes.statusCode !== 200) flowFailures.push(`list ${listRes.statusCode}`);
    if (schools.length >= 2 && compareStatus !== 200) flowFailures.push(`compare ${compareStatus}`);
    if (mapRes.statusCode !== 200) flowFailures.push(`map ${mapRes.statusCode}`);
    if (dashRes.statusCode !== 200) flowFailures.push(`dashboard ${dashRes.statusCode}`);

    const report = {
      generatedAt: new Date().toISOString(),
      totalSchools: schools.length,
      apiDetailPass: pass,
      pdfEndpointPass: pdfPass,
      pdfEndpointSkippedNoPath: pdfSkip,
      failures,
      flowFailures,
      ok: failures.length === 0 && flowFailures.length === 0,
    };

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n=== API verification ===\n${JSON.stringify(report, null, 2)}\n`);

    if (!report.ok) {
      process.exit(1);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
