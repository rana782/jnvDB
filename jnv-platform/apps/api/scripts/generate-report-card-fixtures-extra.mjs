/**
 * Generate additional report-card PDF fixtures (same layout as report-card-sample.pdf, different UDISE / region / counts).
 * Run from apps/api: node scripts/generate-report-card-fixtures-extra.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

function writePdf(outFile, lines) {
  const doc = new PDFDocument({ size: "LETTER", margin: 72 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  doc.fontSize(11);
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
  return new Promise((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  }).then(() => {
    const buf = Buffer.concat(chunks);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, buf);
    return buf;
  });
}

async function verifyParse(buf, outFile) {
  const parsed = await pdfParse(buf);
  const fromDisk = await pdfParse(fs.readFileSync(outFile));
  if (fromDisk.text.length !== parsed.text.length) {
    console.error("pdf-parse mismatch:", outFile);
    process.exit(1);
  }
  console.log("Wrote", outFile, "text chars", parsed.text.length);
}

/** Phase 1: different UDISE + smaller totals + different social balance (Assam). */
const SECOND_LINES = [
  "UDISE : 21040100801",
  "Academic Year : 2024-25",
  "School Name : Secondary Fixture Vidyalaya",
  "State : Assam",
  "District : Nagaon District Office",
  "Social Category",
  "Scheduled Caste (SC) : 88",
  "Scheduled Tribe (ST) : 35",
  "OBC : 120",
  "General : 75",
  "Total : 318",
  "Religious Minority",
  "Muslim : 40",
  "Christian : 8",
  "Sikh : 6",
  "Buddhist : 2",
  "Jain : 0",
  "Others : 12",
  "Minority Total : 68",
  "Total Students : 318",
  "Boys : 155",
  "Girls : 163",
  "Age-wise distribution",
  "10 : 36",
  "11 : 36",
  "12 : 36",
  "13 : 35",
  "14 : 35",
  "15 : 35",
  "16 : 35",
  "17 : 35",
  "18 : 35",
  "Age Total : 318",
  "Basic Facilities",
  "Electricity Available : Yes",
  "Drinking Water Available : Yes",
  "Other Enrolment",
  "BPL : 10",
  "Repeater : 4",
  "CWSN : 2",
  "EWS : 28",
  "Other categories : 6",
  "Total : 50",
  "Teaching Staff",
  "Total Teachers : 14",
  "Male Teachers : 8",
  "Female Teachers : 6",
  "Trained Teachers : 11",
  "Untrained Teachers : 3",
  "ICT / Digital Facilities",
  "Desktops : 22",
  "Laptops : 4",
  "Tablets : 8",
  "Printers : 3",
  "Smart Class TV : 2",
  "Projectors : 1",
];

/** Phase 2: different state/district naming (Himachal), smaller cohort. */
const REGION_LINES = [
  "UDISE : 09030101501",
  "Academic Year : 2024-25",
  "School Name : Himalayan Regional Test Vidyalaya",
  "State : Himachal Pradesh",
  "District : Shimla Urban Education Block",
  "Social Category",
  "Scheduled Caste (SC) : 44",
  "Scheduled Tribe (ST) : 18",
  "OBC : 78",
  "General : 46",
  "Total : 186",
  "Religious Minority",
  "Muslim : 22",
  "Christian : 4",
  "Sikh : 3",
  "Buddhist : 1",
  "Jain : 1",
  "Others : 6",
  "Minority Total : 37",
  "Total Students : 186",
  "Boys : 92",
  "Girls : 94",
  "Age-wise distribution",
  "10 : 22",
  "11 : 21",
  "12 : 21",
  "13 : 21",
  "14 : 20",
  "15 : 20",
  "16 : 20",
  "17 : 20",
  "18 : 21",
  "Age Total : 186",
  "Basic Facilities",
  "Electricity Available : Yes",
  "Drinking Water Available : Yes",
  "Other Enrolment",
  "BPL : 6",
  "Repeater : 2",
  "CWSN : 1",
  "EWS : 18",
  "Other categories : 4",
  "Total : 31",
  "Teaching Staff",
  "Total Teachers : 9",
  "Male Teachers : 5",
  "Female Teachers : 4",
  "Trained Teachers : 7",
  "Untrained Teachers : 2",
  "ICT / Digital Facilities",
  "Desktops : 12",
  "Laptops : 2",
  "Tablets : 4",
  "Printers : 2",
  "Smart Class TV : 1",
  "Projectors : 1",
];

const secondOut = path.join(apiRoot, "test", "fixtures", "report-card-secondary.pdf");
const regionOut = path.join(apiRoot, "test", "fixtures", "report-card-regional.pdf");

const b1 = await writePdf(secondOut, SECOND_LINES);
await verifyParse(b1, secondOut);
const b2 = await writePdf(regionOut, REGION_LINES);
await verifyParse(b2, regionOut);
