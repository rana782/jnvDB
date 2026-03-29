/**
 * Regenerate test/fixtures/report-card-sample.pdf (pdf-parse–compatible PM SHRI–style text).
 * Run from apps/api: node scripts/generate-report-card-test-pdf.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const outFile = path.join(apiRoot, "test", "fixtures", "report-card-sample.pdf");
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const doc = new PDFDocument({ size: "LETTER", margin: 72 });
const chunks = [];
doc.on("data", (c) => chunks.push(c));

doc.fontSize(11);
const lines = [
  "UDISE : 11050300101",
  "School Name : Integration Test Vidyalaya",
  "State : Test State",
  "District : Test District",
  "Social Category",
  "Scheduled Caste (SC) : 120",
  "Scheduled Tribe (ST) : 45",
  "OBC : 200",
  "General : 80",
  "Total : 445",
  "Religious Minority",
  "Muslim : 60",
  "Christian : 12",
  "Sikh : 8",
  "Buddhist : 4",
  "Jain : 1",
  "Others : 20",
  "Minority Total : 105",
  "Total Students : 445",
  "Boys : 220",
  "Girls : 225",
  "Age-wise distribution",
  "10 : 50",
  "11 : 50",
  "12 : 50",
  "13 : 50",
  "14 : 49",
  "15 : 49",
  "16 : 49",
  "17 : 49",
  "18 : 49",
  "Age Total : 445",
];
let y = 72;
for (const l of lines) {
  doc.text(l, 72, y);
  y += 16;
  if (y > 720) {
    doc.addPage();
    y = 72;
  }
}
doc.end();

await new Promise((resolve) => doc.on("end", resolve));
const buf = Buffer.concat(chunks);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, buf);

const parsed = await pdfParse(buf);
const fromDisk = await pdfParse(fs.readFileSync(outFile));
if (fromDisk.text.length !== parsed.text.length) {
  console.error("pdf-parse mismatch: in-memory vs disk read");
  process.exit(1);
}
console.log("Wrote", outFile);
