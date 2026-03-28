import path from "path";
import fs from "fs/promises";
import { config } from "../config.js";
import { delay } from "./crawler.js";

function slug(s) {
  return (s || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "school";
}

function reportLocators(page) {
  return [
    (p) => p.getByRole("link", { name: /report card/i }),
    (p) => p.getByRole("button", { name: /report card/i }),
    (p) => p.locator("a:has-text(\"Report Card\")"),
    (p) => p.locator("button:has-text(\"Report Card\")"),
  ];
}

/**
 * Click Report Card and save PDF to data/pdfs/{udise_code}.pdf (or slug from school name).
 * Retries up to config.retryCount (2 attempts means 1 retry after first failure — total 2 tries; user asked retry 2 times if failed = 3 tries total).
 * Here: attempts = retryCount + 1 (default 3 tries when retryCount is 2).
 */
export async function downloadPDF(page, schoolData) {
  const key = (schoolData.udise_code && String(schoolData.udise_code).trim()) || slug(schoolData.school_name);
  const target = path.join(config.paths.pdfs, key + ".pdf");
  await fs.mkdir(config.paths.pdfs, { recursive: true });

  const maxAttempts = config.retryCount + 1;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const factories = reportLocators(page);
      let trigger = null;
      for (const fn of factories) {
        const loc = fn(page).first();
        if (await loc.isVisible().catch(() => false)) {
          trigger = loc;
          break;
        }
      }
      if (!trigger) throw new Error("Report Card control not found");

      const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
      await trigger.click();
      let download;
      try {
        download = await downloadPromise;
      } catch {
        const popup = await page.waitForEvent("popup", { timeout: 15_000 }).catch(() => null);
        if (popup) {
          const url = popup.url();
          if (/\.pdf($|\?)/i.test(url)) {
            const res = await page.context().request.get(url).catch(() => null);
            const body = res ? await res.body() : null;
            if (body && body.length > 10_000) {
              await fs.writeFile(target, body);
            } else {
              await popup.close();
              throw new Error("Popup did not yield PDF bytes");
            }
            await popup.close().catch(() => {});
          } else {
            await popup.close().catch(() => {});
            throw new Error("Popup URL is not a direct PDF");
          }
        } else {
          throw new Error("No download event and no PDF popup");
        }
      }

      if (download) {
        await download.saveAs(target);
      }

      await delay(config.delays.action);
      const st = await fs.stat(target).catch(() => null);
      if (!st || st.size < 1024) throw new Error("PDF missing or too small after save");

      console.log("[✔] PDF downloaded → " + target);
      return { pdfPath: target, udise_key: key };
    } catch (e) {
      lastErr = e;
      console.warn("[downloader] attempt " + attempt + "/" + maxAttempts + " failed: " + (e && e.message));
      await delay(config.delays.action * attempt);
    }
  }
  throw lastErr || new Error("downloadPDF failed");
}