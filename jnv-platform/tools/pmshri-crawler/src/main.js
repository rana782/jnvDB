/**
 * JNV pipeline: ArcGIS pmshree layer (schmgt=93 = all NVS in PM SHRI) + PM SHRI API details.
 * Report-card PDFs: run `npm run download-pdfs` (fetchSchoolReportCard API).
 */
import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import { config } from "../config.js";
import { delay, saveProgress, resumeScraper } from "./crawler.js";
import { queryAllNvsPmshriSchools } from "./arcgis-discovery.js";
import { fetchSchoolDetails } from "./pmshri-api.js";
import { saveSchoolRecord, saveFailedSchool, loadSchoolsIndex } from "./indexer.js";
import { normalizeUdise } from "./udise.js";

const JNV_LIST_FILE = path.join(config.paths.data, "jnv_udise_list.json");

function schoolKey(udise) {
  const u = normalizeUdise(udise);
  return u ? `udise:${u}` : "";
}

async function buildCompletedSet() {
  const rows = await loadSchoolsIndex();
  const set = new Set();
  for (const r of rows) {
    if (r.udise_code) set.add(schoolKey(r.udise_code));
  }
  return set;
}

async function run() {
  const progress = await resumeScraper();
  const completed = await buildCompletedSet();
  const maxSchools = config.maxSchools > 0 ? config.maxSchools : Number.MAX_SAFE_INTEGER;
  let processed = 0;

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({ viewport: config.viewport });
  const page = await context.newPage();

  try {
    let unique = [];
    /** When true, ignore saved arcgis_school_index (list file was just rebuilt; old cursor does not match new order). */
    let jnvListJustBuilt = false;

    if (process.env.REFRESH_JNV_LIST !== "1") {
      try {
        const raw = await fs.readFile(JNV_LIST_FILE, "utf8");
        unique = JSON.parse(raw);
        if (Array.isArray(unique) && unique.length) {
          console.log(`[main] Loaded ${unique.length} schools from jnv_udise_list.json`);
        }
      } catch {
        unique = [];
      }
    }

    if (!unique.length) {
      console.log("[main] Building JNV list (ArcGIS schmgt=93, all PM SHRI NVS)…");
      const allSchools = await queryAllNvsPmshriSchools();
      const seen = new Set();
      for (const s of allSchools) {
        if (!s.udise_code || seen.has(s.udise_code)) continue;
        seen.add(s.udise_code);
        unique.push(s);
      }
      console.log(`[main] Total unique NVS/JNV in PM SHRI layer: ${unique.length}`);
      await fs.mkdir(config.paths.data, { recursive: true });
      await fs.writeFile(JNV_LIST_FILE, JSON.stringify(unique, null, 2), "utf8");
      await saveProgress({ arcgis_state_index: 36, arcgis_school_index: 0 });
      jnvListJustBuilt = true;
    }

    const startIdx = jnvListJustBuilt ? 0 : progress.arcgis_school_index || 0;
    for (let i = startIdx; i < unique.length; i++) {
      if (processed >= maxSchools) {
        console.log("[main] MAX_SCHOOLS reached.");
        await saveProgress({ arcgis_school_index: i });
        return;
      }

      const arc = unique[i];
      const udise = normalizeUdise(arc.udise_code);
      const ck = schoolKey(udise);
      if (completed.has(ck)) {
        console.log("[main] Skip (already in schools.json):", udise);
        await saveProgress({ arcgis_school_index: i + 1 });
        continue;
      }

      console.log(`[main] School ${i + 1}/${unique.length}: ${udise} — ${arc.school_name}`);

      try {
        const data = await fetchSchoolDetails(udise);
        if (!data) {
          throw new Error("school/details API returned empty");
        }

        const screenshotPath = path.join(config.paths.screenshots, `${udise}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

        const record = {
          udise_code: udise,
          school_name: data.school_name || arc.school_name,
          state: data.state_name || arc.state_label,
          district: data.district_name || String(arc.lgd_district_id || ""),
          address: [data.block_name, data.district_name].filter(Boolean).join(", "),
          internet_availability: data.internet_yn === 1 ? "Yes" : data.internet_yn === 0 ? "No" : "",
          electricity_availability: data.electricity_yn === 1 ? "Yes" : data.electricity_yn === 0 ? "No" : "",
          pdf_path: "",
          screenshot_path: screenshotPath,
          file_size: 0,
          pdf_status: "not_available",
          verification_status: "api_only",
          status: "metadata_saved",
          source: "arcgis_pmshree_layer + apipmshridashboard",
          arcgis_state_label: arc.state_label,
          lgd_district_id: arc.lgd_district_id,
          latitude: arc.latitude,
          longitude: arc.longitude,
          hm_email: data.hm_email || "",
          hm_mobile: data.hm_mobile || "",
          timestamp: new Date().toISOString(),
        };

        await saveSchoolRecord(record);
        completed.add(ck);
        processed++;
        console.log("[main] State → District → School → Done (API):", record.school_name);

        await saveProgress({ arcgis_school_index: i + 1 });
        await delay(config.delays.betweenSchools);
      } catch (err) {
        console.error("[main] Error:", err.message);
        await saveFailedSchool({
          udise_code: udise,
          school_name: arc.school_name,
          state: arc.state_label,
          district: String(arc.lgd_district_id || ""),
          reason: err.message,
          step: "api_fetch",
        });
        await saveProgress({ arcgis_school_index: i + 1 });
        await delay(config.delays.action);
      }
    }

    console.log("[main] Finished. Processed (this run):", processed);
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
