/**
 * Recover missing age-band rows using latest stored raw extraction text.
 * Usage: npx tsx scripts/dev-recover-age-bands.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { getPrisma } from "../src/shared/prisma.js";
import { extractEnrolmentAgeFromReportCard } from "../src/modules/import/parser/age.js";
import { ENROLMENT_AGE_BAND } from "../src/modules/import/report-card-normalized.js";

loadDotenv();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

async function main() {
  const prisma = getPrisma();
  const schools = await prisma.school.findMany({
    select: {
      udise: true,
      totalStudents: true,
      enrolmentAge: { select: { ageBand: true, total: true } },
      rawExtractions: { orderBy: { createdAt: "desc" }, take: 1, select: { rawText: true } },
    },
  });

  let scanned = 0;
  let recoveredSchools = 0;
  let recoveredBandRows = 0;
  let skippedNoRaw = 0;
  let skippedAlreadyGood = 0;

  for (const s of schools) {
    scanned++;
    const hasBands = s.enrolmentAge.some((r) => r.ageBand !== "Total" && (r.total ?? 0) > 0);
    if (hasBands) {
      skippedAlreadyGood++;
      continue;
    }
    const raw = s.rawExtractions[0]?.rawText ?? "";
    if (!raw || raw.trim().length < 50) {
      skippedNoRaw++;
      continue;
    }

    const { enrolmentAge } = extractEnrolmentAgeFromReportCard(raw);
    const nonTotalKeys = (Object.keys(ENROLMENT_AGE_BAND) as (keyof typeof ENROLMENT_AGE_BAND)[]).filter(
      (k) => k !== "total",
    );
    const hasRecoveredBands = nonTotalKeys.some((k) => (enrolmentAge[k] ?? 0) > 0);
    if (!hasRecoveredBands) continue;

    const rows = (Object.keys(ENROLMENT_AGE_BAND) as (keyof typeof ENROLMENT_AGE_BAND)[])
      .map((k) => {
        let total = enrolmentAge[k];
        if (k === "total" && total == null) total = s.totalStudents ?? null;
        return { ageBand: ENROLMENT_AGE_BAND[k], total };
      })
      .filter((r) => r.total != null && (r.ageBand === "Total" || (r.total ?? 0) > 0));

    if (rows.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      await tx.schoolEnrolmentAge.deleteMany({ where: { udise: s.udise } });
      await tx.schoolEnrolmentAge.createMany({
        data: rows.map((r) => ({
          udise: s.udise,
          ageBand: r.ageBand,
          boys: null,
          girls: null,
          total: r.total ?? null,
        })),
      });
    });

    recoveredSchools++;
    recoveredBandRows += rows.filter((r) => r.ageBand !== "Total").length;
  }

  console.log({
    scanned,
    recoveredSchools,
    recoveredBandRows,
    skippedNoRaw,
    skippedAlreadyGood,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
