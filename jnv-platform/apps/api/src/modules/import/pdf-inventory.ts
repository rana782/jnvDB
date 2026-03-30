import path from "node:path";
import { normalizeUdise } from "../../shared/udise.js";
import { collectPdfFilesRecursive, listPdfFilesInRootOnly } from "../../config/paths.js";

export type PdfInventory = {
  /** Canonical absolute path per 11-digit UDISE (first path wins when sorted lexicographically). */
  udiseToPdfPath: Map<string, string>;
  /** Extra PDFs on disk for the same UDISE (not imported). */
  duplicatePaths: { udise: string; path: string }[];
};

/**
 * Build a UDISE → PDF path map. Duplicate basenames resolve deterministically to the lexicographically
 * smallest full path so bulk import is stable and idempotent.
 */
export async function buildPdfInventory(pdfsDir: string, recursive: boolean): Promise<PdfInventory> {
  const absoluteList = recursive
    ? await collectPdfFilesRecursive(pdfsDir)
    : await listPdfFilesInRootOnly(pdfsDir);

  const byUdise = new Map<string, string[]>();
  for (const full of absoluteList) {
    const udise = normalizeUdise(path.basename(full, ".pdf"));
    if (!/^\d{11}$/.test(udise)) continue;
    const arr = byUdise.get(udise) ?? [];
    arr.push(full);
    byUdise.set(udise, arr);
  }

  const udiseToPdfPath = new Map<string, string>();
  const duplicatePaths: { udise: string; path: string }[] = [];

  for (const [udise, list] of byUdise) {
    const sorted = [...list].sort((a, b) => a.localeCompare(b));
    udiseToPdfPath.set(udise, sorted[0]!);
    for (const p of sorted.slice(1)) {
      duplicatePaths.push({ udise, path: p });
    }
  }

  return { udiseToPdfPath, duplicatePaths };
}
