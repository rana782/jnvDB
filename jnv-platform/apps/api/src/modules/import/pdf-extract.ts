import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// pdf-parse is CommonJS
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

const MIN_TEXT_CHARS = 80;

export type PdfExtractResult = {
  text: string;
  charCount: number;
  pages: number;
  usedOcr: boolean;
};

async function ocrFallback(buffer: Buffer): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const {
      data: { text },
    } = await worker.recognize(buffer);
    await worker.terminate();
    return (text || "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

/**
 * Text-first extraction; optional Tesseract pass when embedded text is too short (best-effort on rasterized PDFs).
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  const data = await pdfParse(buffer);
  let text = (data.text || "").replace(/\s+/g, " ").trim();
  let usedOcr = false;
  if (text.length < MIN_TEXT_CHARS) {
    const ocr = await ocrFallback(buffer);
    if (ocr.length > text.length) {
      text = ocr;
      usedOcr = true;
    }
  }
  return { text, charCount: text.length, pages: data.numpages, usedOcr };
}

export type ParsedReportFields = {
  udise?: string;
  academicYear?: string;
  schoolName?: string;
  state?: string;
  district?: string;
  block?: string;
  pincode?: string;
  totalStudents?: number;
  totalBoys?: number;
  totalGirls?: number;
  totalTeachers?: number;
  water?: boolean;
  electricity?: boolean;
  internet?: boolean;
  solar?: boolean;
  playground?: boolean;
  library?: boolean;
  confidence: number;
  warnings: string[];
};

function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

function boolFromLine(line: string, label: RegExp): boolean | undefined {
  const m = line.match(label);
  if (!m) return undefined;
  const v = m[1]?.toLowerCase() ?? "";
  if (/yes|available|functional|1/.test(v)) return true;
  if (/no|not|0/.test(v)) return false;
  return undefined;
}

/**
 * Heuristic parser for PM SHRI-style report cards (labels vary).
 */
export function parseReportCardText(text: string, fallbackUdise: string): ParsedReportFields {
  const warnings: string[] = [];
  let confidence = 0.4;
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  let udise: string | undefined;
  const udiseM = text.match(/UDISE[:\s]*(\d{11})/i) || text.match(/\b(\d{11})\b/);
  if (udiseM) {
    udise = udiseM[1];
    confidence += 0.15;
  } else {
    udise = fallbackUdise;
    warnings.push("UDISE not found in PDF; using filename");
  }

  let schoolName: string | undefined;
  const nameM = text.match(/School Name[:\s]+([^\n]+)/i);
  if (nameM) {
    schoolName = nameM[1].trim().slice(0, 200);
    confidence += 0.1;
  }

  let academicYear: string | undefined;
  const ayM =
    text.match(/Academic\s*Year[:\s]+([^\n]+)/i) ||
    text.match(/Year[:\s]+(20\d{2}[-–/]?\d{2,4})/i);
  if (ayM) {
    academicYear = ayM[1].trim().slice(0, 32);
    confidence += 0.05;
  }

  let state: string | undefined;
  let district: string | undefined;
  const stM = text.match(/State[:\s]+([^\n]+)/i);
  if (stM) {
    state = stM[1].trim().slice(0, 120);
    confidence += 0.05;
  }
  const distM = text.match(/District[:\s]+([^\n]+)/i);
  if (distM) {
    district = distM[1].trim().slice(0, 120);
    confidence += 0.05;
  }

  let block: string | undefined;
  const blk = text.match(/Block[:\s]+([^\n]+)/i);
  if (blk) block = blk[1].trim().slice(0, 120);

  let pincode: string | undefined;
  const pin = text.match(/\b(\d{6})\b/);
  if (pin) pincode = pin[1];

  const ts = text.match(/Total\s*(?:Students?|Enrolment)[:\s]*(\d[\d,]*)/i);
  const totalStudents = num(ts?.[1]);

  const tb = text.match(/Boys[:\s]*(\d[\d,]*)/i);
  const tg = text.match(/Girls[:\s]*(\d[\d,]*)/i);
  const totalBoys = num(tb?.[1]);
  const totalGirls = num(tg?.[1]);

  const tt = text.match(/Total\s*Teachers?[:\s]*(\d[\d,]*)/i);
  const totalTeachers = num(tt?.[1]);

  let solar: boolean | undefined;
  let playground: boolean | undefined;
  let library: boolean | undefined;

  const blob = lines.join(" ");
  const water = boolFromLine(blob, /Water[:\s]*(Yes|No|Available|Not)/i);
  const electricity = boolFromLine(blob, /Electricity[:\s]*(Yes|No|Available|Not)/i);
  const internet = boolFromLine(blob, /Internet[:\s]*(Yes|No|Available|Not)/i);

  if (totalStudents == null && totalBoys == null) warnings.push("Student counts not parsed");
  confidence = Math.min(0.95, confidence);

  return {
    udise,
    academicYear,
    schoolName,
    state,
    district,
    block,
    pincode,
    totalStudents,
    totalBoys,
    totalGirls,
    totalTeachers,
    water,
    electricity,
    internet,
    solar,
    playground,
    library,
    confidence,
    warnings,
  };
}
