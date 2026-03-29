/**
 * Place the canonical test PDF at tools/pmshri-crawler/data/pdfs/11050300101.pdf
 * so `npm run import:run` always ingests the golden UDISE during verify:stack.
 *
 * Run from apps/api: node scripts/ensure-golden-pdf-for-verify.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..", "..");
const fixture = path.join(apiRoot, "test", "fixtures", "report-card-sample.pdf");
const fixtureSecondary = path.join(apiRoot, "test", "fixtures", "report-card-secondary.pdf");
const fixtureRegional = path.join(apiRoot, "test", "fixtures", "report-card-regional.pdf");
const pdfsDir = path.join(repoRoot, "tools", "pmshri-crawler", "data", "pdfs");
const dest = path.join(pdfsDir, "11050300101.pdf");

if (!fs.existsSync(fixture)) {
  console.error("Missing fixture PDF:", fixture);
  process.exit(1);
}
if (!fs.existsSync(fixtureSecondary) || !fs.existsSync(fixtureRegional)) {
  console.error(
    "Missing expansion fixtures. Run: node scripts/generate-report-card-fixtures-extra.mjs",
  );
  process.exit(1);
}
fs.mkdirSync(pdfsDir, { recursive: true });
fs.copyFileSync(fixture, dest);
console.log("Golden PDF ready:", dest);
/** Second UDISE (same fixture) so Compare page can request two distinct schools. */
const dest2 = path.join(pdfsDir, "11050300102.pdf");
fs.copyFileSync(fixture, dest2);
console.log("Secondary PDF for compare:", dest2);
/** Phase 1: different UDISE + counts (Assam-style labels in PDF text). */
const destSecondary = path.join(pdfsDir, "21040100801.pdf");
fs.copyFileSync(fixtureSecondary, destSecondary);
console.log("Expansion secondary fixture:", destSecondary);
/** Phase 2: different region strings in PDF text (Himachal / Shimla). */
const destRegional = path.join(pdfsDir, "09030101501.pdf");
fs.copyFileSync(fixtureRegional, destRegional);
console.log("Expansion regional fixture:", destRegional);
