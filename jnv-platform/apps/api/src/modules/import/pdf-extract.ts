import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

const MIN_TEXT_CHARS = 80;

function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type PdfExtractResult = {
  text: string;
  charCount: number;
  pages: number;
  usedOcr: boolean;
};

export type PdfExtractOptions = {
  /** Force OCR even when embedded PDF text is present. */
  forceOcr?: boolean;
};

async function ocrFallback(buffer: Buffer): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const {
      data: { text },
    } = await worker.recognize(buffer);
    await worker.terminate();
    return normalizeExtractedText(text || "");
  } catch {
    return "";
  }
}

async function extractTextWithPdfJs(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (item && typeof item === "object" && "str" in item && typeof (item as { str: string }).str === "string") {
        parts.push((item as { str: string }).str);
      }
    }
  }
  return {
    text: normalizeExtractedText(parts.join("\n")),
    numPages: pdf.numPages,
  };
}

/**
 * Text-first extraction; optional Tesseract pass when embedded text is too short (best-effort on rasterized PDFs).
 * Uses pdf-parse first; falls back to pdf.js when pdf-parse cannot read the file (common for some pdfkit outputs).
 */
export async function extractPdfText(
  buffer: Buffer,
  options?: PdfExtractOptions,
): Promise<PdfExtractResult> {
  let text = "";
  let pages = 0;
  try {
    const data = await pdfParse(buffer);
    text = normalizeExtractedText(data.text || "");
    pages = data.numpages;
  } catch {
    const j = await extractTextWithPdfJs(buffer);
    text = j.text;
    pages = j.numPages;
  }
  let usedOcr = false;
  if (options?.forceOcr || text.length < MIN_TEXT_CHARS) {
    const ocr = await ocrFallback(buffer);
    if (ocr.length > text.length) {
      text = ocr;
      usedOcr = true;
    } else if (options?.forceOcr && ocr.length > 0) {
      text = ocr;
      usedOcr = true;
    }
  }
  return { text, charCount: text.length, pages, usedOcr };
}

export { reportCardExtractionMeta, calculateConfidenceForSection } from "./confidence.js";
export { parseReportCardText, extractReportCard } from "./report-card-parse.js";
export { extractEnrolmentSocialFromReportCard } from "./parser/social.js";
export { extractEnrolmentMinorityFromReportCard, minorityHasData } from "./parser/minority.js";
export { extractEnrolmentOthersFromReportCard, othersHasData } from "./parser/others.js";
export { extractEnrolmentAgeFromReportCard, ageHasData } from "./parser/age.js";
export { extractInfraFromReportCard, infraHasData } from "./parser/infra.js";
export { extractDigitalFromReportCard, digitalHasData } from "./parser/digital.js";
export { extractTeachersFromReportCard, teachersHasData } from "./parser/teachers.js";
export {
  extractAcademicYearFromReportCard,
  extractStudentHeadcountFromReportCard,
  parseReportCardTextLegacy,
} from "./parser/profile.js";

export type { ReportCardParseResult } from "./report-card-normalized.js";
