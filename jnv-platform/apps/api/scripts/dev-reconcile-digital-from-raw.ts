import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { getPrisma } from "../src/shared/prisma.js";
import { digitalHasData, extractDigitalFromReportCard } from "../src/modules/import/parser/digital.js";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const devDb = path.join(API_ROOT, "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

type SnapshotPayload = {
  structured?: {
    digital?: {
      desktops?: number | null;
      laptops?: number | null;
      tablets?: number | null;
      printers?: number | null;
      projectors?: number | null;
      smartClassTv?: number | null;
    };
    digitalConfidence?: number;
  };
  confidenceBySection?: {
    digital?: number;
  };
};

async function main() {
  const prisma = getPrisma();
  const schools = await prisma.school.findMany({
    where: { rawExtractions: { some: {} } },
    select: {
      udise: true,
      digital: { select: { desktops: true, laptops: true, tablets: true, printers: true, smartClassTv: true } },
      rawExtractions: { orderBy: { createdAt: "desc" }, take: 1, select: { rawText: true } },
      reportCardSnapshot: { select: { udise: true, payload: true } },
    },
  });

  let updatedDigital = 0;
  let updatedSnapshot = 0;
  let scanned = 0;
  for (const s of schools) {
    const text = s.rawExtractions[0]?.rawText ?? "";
    if (!text) continue;
    scanned++;
    const parsed = extractDigitalFromReportCard(text);
    if (!digitalHasData(parsed.digital)) continue;

    const next = {
      desktops: parsed.digital.desktops ?? null,
      laptops: parsed.digital.laptops ?? null,
      tablets: parsed.digital.tablets ?? null,
      printers: parsed.digital.printers ?? null,
      smartClassTv: parsed.digital.smartClassTv ?? null,
    };
    const prev = s.digital;
    const changed =
      (prev?.desktops ?? null) !== next.desktops ||
      (prev?.laptops ?? null) !== next.laptops ||
      (prev?.tablets ?? null) !== next.tablets ||
      (prev?.printers ?? null) !== next.printers ||
      (prev?.smartClassTv ?? null) !== next.smartClassTv;
    if (changed) {
      await prisma.schoolDigitalFacilities.upsert({
        where: { udise: s.udise },
        update: next,
        create: { udise: s.udise, ...next },
      });
      updatedDigital++;
    }

    if (s.reportCardSnapshot?.udise) {
      const payload = (s.reportCardSnapshot.payload ?? {}) as SnapshotPayload;
      const merged: SnapshotPayload = {
        ...payload,
        structured: {
          ...(payload.structured ?? {}),
          digital: {
            ...(payload.structured?.digital ?? {}),
            desktops: parsed.digital.desktops ?? null,
            laptops: parsed.digital.laptops ?? null,
            tablets: parsed.digital.tablets ?? null,
            printers: parsed.digital.printers ?? null,
            projectors: parsed.digital.projectors ?? null,
            smartClassTv: parsed.digital.smartClassTv ?? null,
          },
          digitalConfidence: parsed.digitalConfidence,
        },
        confidenceBySection: {
          ...(payload.confidenceBySection ?? {}),
          digital: parsed.digitalConfidence,
        },
      };
      await prisma.schoolReportCardSnapshot.update({
        where: { udise: s.reportCardSnapshot.udise },
        data: { payload: merged as object },
      });
      updatedSnapshot++;
    }
  }

  console.log({ scanned, updatedDigital, updatedSnapshot });
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

