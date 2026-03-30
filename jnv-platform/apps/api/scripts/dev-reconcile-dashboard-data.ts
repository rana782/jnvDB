/**
 * Backfill dashboard KPIs from snapshots + apiStateName; refresh map rollups.
 * Usage: npm run dev:reconcile-dashboard -w @jnv/api
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { reconcileSchoolDashboardData } from "../src/modules/analytics/reconcile-school-dashboard-data.service.js";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${devDb.replace(/\\/g, "/")}`;
}

async function main() {
  console.log("Reconciling school KPIs for dashboard / map…");
  const out = await reconcileSchoolDashboardData();
  console.log("Done.", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
