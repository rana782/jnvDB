/**
 * Download PM SHRI report-card PDFs for every row in data/schools.json (JNV / PM SHRI schools).
 * Uses GET .../school/fetchSchoolReportCard/{udise} — response `data` is base64 PDF.
 */
import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";
import { delay } from "./crawler.js";
import { normalizeUdise } from "./udise.js";
import { fetchReportCardPdfBytes } from "./pmshri-api.js";
import { saveSchoolRecord, loadSchoolsIndex } from "./indexer.js";

function num(envKey, fallback) {
  const v = process.env[envKey];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function fileExistsNonEmpty(p, minBytes) {
  try {
    const st = await fs.stat(p);
    return st.size >= minBytes;
  } catch {
    return false;
  }
}

async function run() {
  const maxPdfs = num("MAX_PDFS", 0);
  const betweenMs = num("BETWEEN_PDFS_MS", num("BETWEEN_SCHOOLS_MS", 1500));
  const skipExisting = process.env.SKIP_EXISTING !== "0";

  await fs.mkdir(config.paths.pdfs, { recursive: true });

  const rows = await loadSchoolsIndex();
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.udise_code) continue;
    if (maxPdfs > 0 && done >= maxPdfs) break;

    const udise = normalizeUdise(row.udise_code);
    const pdfPath = path.join(config.paths.pdfs, `${udise}.pdf`);

    if (skipExisting && (await fileExistsNonEmpty(pdfPath, 1024))) {
      skipped++;
      if (!row.pdf_path || row.pdf_status !== "downloaded") {
        const st = await fs.stat(pdfPath);
        await saveSchoolRecord({
          ...row,
          udise_code: udise,
          pdf_path: pdfPath,
          file_size: st.size,
          pdf_status: "downloaded",
          verification_status: row.verification_status || "api_only",
        });
      }
      continue;
    }

    console.log(`[pdf] ${udise} — ${row.school_name || ""}`.slice(0, 120));

    const buf = await fetchReportCardPdfBytes(udise);
    if (!buf) {
      console.warn("[pdf]   no PDF from API");
      failed++;
      await saveSchoolRecord({
        ...row,
        udise_code: udise,
        pdf_path: "",
        file_size: 0,
        pdf_status: "api_empty",
      });
      await delay(betweenMs);
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
    console.log(`[pdf]   saved ${buf.length} bytes → ${pdfPath}`);
    await delay(betweenMs);
  }

  console.log(`[pdf] Finished. Downloaded (this run): ${done}, skipped existing: ${skipped}, failed: ${failed}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
