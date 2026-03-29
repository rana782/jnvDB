/**
 * Capture a real GET /api/schools/:udise JSON for acceptance / debugging.
 * Usage (from apps/api): npx tsx scripts/capture-school-detail-response.ts
 * Optional: DATABASE_URL, SCHOOL_UDISE=11050300101
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const devDb = path.join(apiRoot, "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

const { resetPrismaForTests } = await import("../src/shared/prisma.js");
await resetPrismaForTests();
const { getPrisma } = await import("../src/shared/prisma.js");
const prisma = getPrisma();

const defaultGolden = "11050300101";
const prefer = (process.env.SCHOOL_UDISE?.trim() || defaultGolden) as string;
let udise: string | undefined;
if (/^\d{11}$/.test(prefer)) {
  const row = await prisma.school.findUnique({ where: { udise: prefer }, select: { udise: true } });
  udise = row?.udise;
}
if (!udise) {
  udise = (await prisma.school.findFirst({ orderBy: { udise: "asc" }, select: { udise: true } }))?.udise;
}
if (!udise) {
  console.error("No School row in database. Run: npm run db:setup -w @jnv/api && npm run import:run -w @jnv/api");
  process.exit(1);
}

const { buildApp } = await import("../src/app.js");
const app = await buildApp();
const res = await app.inject({ method: "GET", url: `/api/schools/${udise}` });
let body: unknown;
try {
  body = res.json();
} catch {
  body = res.body;
}

const outPath =
  process.env.CAPTURE_API_JSON_PATH?.trim() ||
  path.join(apiRoot, "test", "fixtures", "golden-school-11050300101.api.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      request: `GET /api/schools/${udise}`,
      statusCode: res.statusCode,
      udise,
      body,
    },
    null,
    2,
  ),
  "utf8",
);
console.log("Wrote", outPath);
console.log("status", res.statusCode, "udise", udise);
await app.close();
await prisma.$disconnect();
