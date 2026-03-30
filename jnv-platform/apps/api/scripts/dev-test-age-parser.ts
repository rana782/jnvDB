import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { getPrisma } from "../src/shared/prisma.js";
import { extractEnrolmentAgeFromReportCard } from "../src/modules/import/parser/age.js";

loadDotenv();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

async function main() {
  const udise = process.argv[2] ?? "22172604333";
  const prisma = getPrisma();
  const row = await prisma.schoolExtractionRaw.findFirst({
    where: { udise },
    orderBy: { createdAt: "desc" },
    select: { rawText: true },
  });
  const raw = row?.rawText ?? "";
  const parsed = extractEnrolmentAgeFromReportCard(raw);
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
