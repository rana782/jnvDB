/**
 * Central configuration — adjust delays and retries for your environment.
 * Env: BASE_URL, MAX_SCHOOLS (0=unlimited), ACTION_DELAY_MS, PAGE_LOAD_DELAY_MS, RETRY_COUNT, HEADLESS=false
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname);

function num(envKey, fallback) {
  const v = process.env[envKey];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  baseUrl:
    process.env.BASE_URL?.trim() ||
    "https://pmshri.education.gov.in/state",

  delays: {
    action: num("ACTION_DELAY_MS", 800),
    betweenSchools: num("BETWEEN_SCHOOLS_MS", 1200),
    pageLoad: num("PAGE_LOAD_DELAY_MS", 2500),
    afterSelect: num("AFTER_SELECT_MS", 1500),
  },

  retryCount: num("RETRY_COUNT", 2),

  /** 0 = no limit */
  maxSchools: num("MAX_SCHOOLS", 0),

  headless: process.env.HEADLESS !== "false",

  viewport: { width: 1366, height: 900 },

  rootDir: ROOT,

  paths: {
    data: path.join(ROOT, "data"),
    pdfs: path.join(ROOT, "data", "pdfs"),
    screenshots: path.join(ROOT, "data", "screenshots"),
    schoolsJson: path.join(ROOT, "data", "schools.json"),
    failedJson: path.join(ROOT, "data", "failed_schools.json"),
    progressJson: path.join(ROOT, "data", "progress.json"),
  },
};

export default config;

