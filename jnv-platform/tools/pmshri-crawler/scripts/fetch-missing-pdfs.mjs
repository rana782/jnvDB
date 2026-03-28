/**
 * Only download report PDFs where data/pdfs/{udise}.pdf is missing or tiny.
 * Avoids re-hitting the API for 600+ existing files (no reliance on SKIP_EXISTING env).
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { normalizeUdise } from "../src/udise.js";
import { fetchReportCardPdfBytes } from "../src/pmshri-api.js";
import { saveSchoolRecord, loadSchoolsIndex } from "../src/indexer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

async function main() {
  const betweenMs = Number(process.env.BETWEEN_PDFS_MS || 1500);
  const pdfsDir = path.join(ROOT, "data", "pdfs");
  await fs.mkdir(pdfsDir, { recursive: true });

  const rows = await loadSchoolsIndex();
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.udise_code) continue;
    const udise = normalizeUdise(row.udise_code);
    const pdfPath = path.join(pdfsDir, `${udise}.pdf`);
    try {
      const st = await fs.stat(pdfPath);
      if (st.size >= 1024) {
        skipped++;
        continue;
      }
    } catch {
      /* missing */
    }

    console.log(`[missing-pdf] ${udise}`);
    const buf = await fetchReportCardPdfBytes(udise);
    if (!buf) {
      failed++;
      console.warn(`[missing-pdf]   no API PDF`);
      await new Promise((r) => setTimeout(r, betweenMs));
      continue;
    }
    await fs.writeFile(pdfPath, buf);
    await saveSchoolRecord({
      ...row,
      udise_code: udise,
      pdf_path: pdfPath,
      file_size: buf.length,
      pdf_status: "downloaded",
      verification_status: "pdf_downloaded",
    });
    done++;
    console.log(`[missing-pdf]   saved ${buf.length} bytes`);
    await new Promise((r) => setTimeout(r, betweenMs));
  }

  console.log(`[missing-pdf] Done. New: ${done}, already had file: ${skipped}, API empty: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
