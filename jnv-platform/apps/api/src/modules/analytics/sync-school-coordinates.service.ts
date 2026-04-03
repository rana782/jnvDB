/**
 * Copy ArcGIS lat/lon from pmshri crawler `schools.json` into `School.latitude` / `School.longitude`.
 * Run during dashboard reconcile (or standalone) so the state map uses real coordinates.
 *
 * Path: `JNV_SCHOOLS_JSON` env, else `jnv-platform/tools/pmshri-crawler/data/schools.json` next to this monorepo.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrisma } from "../../shared/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** From `src/modules/analytics` → monorepo `jnv-platform` root is five levels up. */
const DEFAULT_SCHOOLS_JSON = path.resolve(
  __dirname,
  "../../../../..",
  "tools",
  "pmshri-crawler",
  "data",
  "schools.json",
);

function normalizeUdise(raw: unknown): string | null {
  const s = String(raw ?? "").replace(/\D/g, "");
  return s.length === 11 ? s : null;
}

function toCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Loose bounds for India + nearby; rejects obvious garbage. */
function isPlausibleIndiaCoord(lat: number, lon: number): boolean {
  return lat >= 6 && lat <= 38 && lon >= 67 && lon <= 98;
}

export type SyncSchoolCoordinatesOptions = {
  filePath?: string;
  quiet?: boolean;
};

export async function syncSchoolCoordinatesFromSchoolsJson(
  options?: SyncSchoolCoordinatesOptions,
): Promise<{ updated: number; missingFile: boolean; rowsInFile: number }> {
  const prisma = getPrisma();
  const fp = (options?.filePath ?? process.env.JNV_SCHOOLS_JSON ?? "").trim() || DEFAULT_SCHOOLS_JSON;

  let raw: string;
  try {
    raw = await readFile(fp, "utf8");
  } catch {
    if (!options?.quiet) {
      console.warn(`syncSchoolCoordinates: could not read schools JSON at ${fp} (set JNV_SCHOOLS_JSON if needed)`);
    }
    return { updated: 0, missingFile: true, rowsInFile: 0 };
  }

  let rows: unknown;
  try {
    rows = JSON.parse(raw) as unknown;
  } catch {
    if (!options?.quiet) console.warn("syncSchoolCoordinates: invalid JSON in schools file");
    return { updated: 0, missingFile: false, rowsInFile: 0 };
  }

  if (!Array.isArray(rows)) {
    return { updated: 0, missingFile: false, rowsInFile: 0 };
  }

  type Pair = { udise: string; latitude: number; longitude: number };
  const byUdise = new Map<string, Pair>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const udise = normalizeUdise(o.udise_code ?? o.udise);
    if (!udise) continue;
    const lat = toCoord(o.latitude);
    const lon = toCoord(o.longitude);
    if (lat == null || lon == null) continue;
    if (!isPlausibleIndiaCoord(lat, lon)) continue;
    byUdise.set(udise, { udise, latitude: lat, longitude: lon });
  }
  const pairs = [...byUdise.values()];

  let updated = 0;
  const chunkSize = 100;
  for (let i = 0; i < pairs.length; i += chunkSize) {
    const chunk = pairs.slice(i, i + chunkSize);
    const counts = await prisma.$transaction(
      chunk.map((p) =>
        prisma.school.updateMany({
          where: { udise: p.udise },
          data: { latitude: p.latitude, longitude: p.longitude },
        }),
      ),
    );
    for (const c of counts) updated += c.count;
  }

  return { updated, missingFile: false, rowsInFile: pairs.length };
}
