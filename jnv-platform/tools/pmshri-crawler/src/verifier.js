import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";
import { delay } from "./crawler.js";

function slug(s) {
  return (s || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "school";
}

async function isPdfMagic(filePath) {
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    return buf.toString("utf8").startsWith("%PDF");
  } finally {
    await fh.close();
  }
}

/**
 * Screenshot report-card view, verify PDF on disk (size > 10KB, PDF header).
 * Retries with config.retryCount.
 * @returns {Promise<object>}
 */
export async function verifyDownload(page, schoolData, pdfPath) {
  const udise = (schoolData.udise_code && String(schoolData.udise_code).trim()) || slug(schoolData.school_name);
  const screenshotPath = path.join(config.paths.screenshots, udise + ".png");
  await fs.mkdir(config.paths.screenshots, { recursive: true });

  const maxAttempts = config.retryCount + 1;
  let last = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log("[✔] Screenshot saved → " + screenshotPath);

      const st = await fs.stat(pdfPath);
      if (st.size <= 10 * 1024) throw new Error("PDF size <= 10KB");
      const magic = await isPdfMagic(pdfPath);
      if (!magic) throw new Error("File is not a PDF (magic bytes)");

      const result = {
        pdf_path: pdfPath,
        screenshot_path: screenshotPath,
        file_size: st.size,
        pdf_status: "ok",
        verification_status: "verified",
      };
      console.log("[✔] Verified");
      return result;
    } catch (e) {
      last = e;
      console.warn("[verifier] attempt " + attempt + "/" + maxAttempts + ": " + (e && e.message));
      await delay(config.delays.action * attempt);
    }
  }

  const st = await fs.stat(pdfPath).catch(() => ({ size: 0 }));
  return {
    pdf_path: pdfPath,
    screenshot_path: screenshotPath,
    file_size: st.size || 0,
    pdf_status: "invalid",
    verification_status: "failed",
    error: last && last.message,
  };
}