/**
 * Local / smoke-testing helper: mark PARTIAL schools as COMPLETE when a report-card snapshot exists
 * (import already succeeded; confidence was below the COMPLETE threshold).
 *
 * After running: refresh map rollups so dashboard/map "completed only" filters match.
 *
 * Usage (from apps/api): npx tsx scripts/dev-promote-partial-schools.ts
 * Optional: --dry-run
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { getPrisma } from "../src/shared/prisma.js";
import { refreshMapAggregates } from "../src/modules/map/map-rollup.service.js";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const prisma = getPrisma();

  const eligible = await prisma.school.count({
    where: {
      parsingStatus: "PARTIAL",
      reportCardSnapshot: { isNot: null },
    },
  });

  console.log(
    JSON.stringify(
      {
        message: dryRun
          ? "Dry run — no DB writes"
          : "Promoting PARTIAL → COMPLETE where snapshot exists (local verification use)",
        eligiblePartialWithSnapshot: eligible,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.school.updateMany({
    where: {
      parsingStatus: "PARTIAL",
      reportCardSnapshot: { isNot: null },
    },
    data: { parsingStatus: "COMPLETE" },
  });

  console.log("Updated rows:", result.count);

  try {
    await refreshMapAggregates();
    console.log("Map rollups refreshed.");
  } catch (e) {
    console.warn("refreshMapAggregates failed (non-fatal):", e);
  }

  const after = await prisma.school.groupBy({
    by: ["parsingStatus"],
    _count: true,
  });
  console.log("By parsingStatus:", Object.fromEntries(after.map((r) => [r.parsingStatus, r._count])));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
