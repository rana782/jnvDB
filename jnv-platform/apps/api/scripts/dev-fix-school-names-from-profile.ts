import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { getPrisma } from "../src/shared/prisma.js";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

const REGION_NAME_RE =
  /\b(bhopal|patna|lucknow|jaipur|chandigarh|shillong|hyderabad|pune)\b/i;

function norm(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

function extractProfileSchoolName(rawText: string | null | undefined): string | null {
  const raw = (rawText ?? "").replace(/\r/g, "\n");
  if (!raw) return null;
  const label =
    raw.match(/school\s*name\s*[:\-]?\s*(jawahar\s+navodaya\s+vidyalaya[^\n]*)/i)?.[1] ?? null;
  const head =
    raw.match(/(?:^|\n)\s*(jawahar\s+navodaya\s+vidyalaya[^\n]*)/i)?.[1] ?? null;
  const picked = norm(label ?? head);
  if (!picked || !/jawahar\s+navodaya\s+vidyalaya/i.test(picked)) return null;
  return picked
    .replace(/\(\*+\d{4,}\)/g, "")
    .replace(/\(\d{11}\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function districtFromSchoolName(name: string | null | undefined): string | null {
  const n = norm(name);
  if (!n) return null;
  const m = n.match(/jawahar\s+navodaya\s+vidyalaya\s+(.+)$/i);
  if (!m?.[1]) return null;
  const parts = norm(m[1])
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? first;
  const picked = REGION_NAME_RE.test(first) && parts.length >= 2 ? last : first;
  if (!picked || picked.length < 2 || /^\d{11}$/.test(picked)) return null;
  return picked;
}

function districtLooksRegion(value: string | null | undefined, regionName: string | null | undefined): boolean {
  const d = norm(value);
  if (!d) return true;
  if (/\bregion|office|social|category|cluster|pincode|block|rural|urban\b/i.test(d)) return true;
  if (REGION_NAME_RE.test(d)) return true;
  const reg = norm(regionName).toLowerCase();
  return Boolean(reg) && d.toLowerCase() === reg;
}

async function main() {
  const prisma = getPrisma();
  const rows = await prisma.school.findMany({
    select: {
      udise: true,
      schoolName: true,
      geographicDistrict: true,
      state: { select: { region: { select: { name: true } } } },
      rawExtractions: { orderBy: { createdAt: "desc" }, take: 1, select: { rawText: true } },
    },
  });

  let changedName = 0;
  let changedDistrict = 0;

  for (const s of rows) {
    const raw = s.rawExtractions[0]?.rawText ?? null;
    const profileName = extractProfileSchoolName(raw);
    const derivedDistrict = districtFromSchoolName(profileName ?? s.schoolName);

    const nextName = profileName ?? s.schoolName;
    const shouldPatchDistrict =
      Boolean(derivedDistrict) &&
      (districtLooksRegion(s.geographicDistrict, s.state?.region?.name ?? null) || !norm(s.geographicDistrict));

    const nameChanged = norm(nextName).toLowerCase() !== norm(s.schoolName).toLowerCase();
    const districtChanged =
      shouldPatchDistrict && norm(derivedDistrict).toLowerCase() !== norm(s.geographicDistrict).toLowerCase();

    if (!nameChanged && !districtChanged) continue;

    await prisma.school.update({
      where: { udise: s.udise },
      data: {
        schoolName: nextName,
        geographicDistrict: districtChanged ? derivedDistrict : s.geographicDistrict,
      },
    });
    if (nameChanged) changedName++;
    if (districtChanged) changedDistrict++;
  }

  console.log({ scanned: rows.length, changedName, changedDistrict });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

