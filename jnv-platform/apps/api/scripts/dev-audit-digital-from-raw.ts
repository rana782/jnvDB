import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { getPrisma } from "../src/shared/prisma.js";
import { extractDigitalFromReportCard } from "../src/modules/import/parser/digital.js";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const devDb = path.join(API_ROOT, "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

function firstInterestingLines(text: string, limit = 14): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines
    .filter((l) =>
      /ict|digital|computer|desktop|laptop|tablet|printer|smart\s*class|functional|projector/i.test(l),
    )
    .slice(0, limit);
}

async function main() {
  const prisma = getPrisma();
  const rows = await prisma.school.findMany({
    where: { rawExtractions: { some: {} }, digital: { isNot: null } },
    select: {
      udise: true,
      schoolName: true,
      digital: { select: { desktops: true, laptops: true, tablets: true, printers: true, smartClassTv: true } },
      rawExtractions: { orderBy: { createdAt: "desc" }, take: 1, select: { rawText: true } },
      reportCardSnapshot: { select: { payload: true } },
    },
    take: 120,
    orderBy: { udise: "asc" },
  });

  let mismatch = 0;
  for (const row of rows) {
    const text = row.rawExtractions[0]?.rawText ?? "";
    const reparsed = extractDigitalFromReportCard(text).digital;
    const old = row.digital;
    const isDiff =
      (old?.desktops ?? null) !== reparsed.desktops ||
      (old?.laptops ?? null) !== reparsed.laptops ||
      (old?.tablets ?? null) !== reparsed.tablets ||
      (old?.printers ?? null) !== reparsed.printers ||
      (old?.smartClassTv ?? null) !== reparsed.smartClassTv;
    if (!isDiff) continue;
    mismatch++;
    console.log("\n---");
    console.log(`${row.udise} | ${row.schoolName ?? "—"}`);
    console.log("DB   :", old);
    const payload = row.reportCardSnapshot?.payload as { structured?: { digital?: unknown } } | null;
    console.log("SNAP :", payload?.structured?.digital ?? null);
    console.log("PARSE:", reparsed);
    const sample = firstInterestingLines(text).join(" | ");
    console.log("RAW  :", sample);
    if (mismatch >= 20) break;
  }
  console.log(`\nscanned=${rows.length} mismatch=${mismatch}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

