/**
 * Backfill dashboard KPIs from snapshots + apiStateName; refresh map rollups.
 * Usage: npm run dev:reconcile-dashboard -w @jnv/api
 *
 * Optional: JNV_RECONCILE_PROGRESS_EVERY (default 50, 0 = fewer progress lines).
 */
import { writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { reconcileSchoolDashboardData } from "../src/modules/analytics/reconcile-school-dashboard-data.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(__dirname, "..", ".env") });

const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

function line(msg: string) {
  try {
    writeSync(1, `${msg}\n`);
  } catch {
    console.log(msg);
  }
}

function progressEveryFromEnv(): number {
  const raw = process.env.JNV_RECONCILE_PROGRESS_EVERY;
  if (raw === undefined || raw === "") return 50;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 50;
}

async function main() {
  line("Reconciling school KPIs for dashboard / map…");
  const out = await reconcileSchoolDashboardData({ progressEvery: progressEveryFromEnv() });
  line(`Done. ${JSON.stringify(out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
