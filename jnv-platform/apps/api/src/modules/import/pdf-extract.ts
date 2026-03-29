import { createRequire } from "node:module";
import { loadEnv } from "../../config/env.js";
import type { ReportCardParseResult, ReportCardNormalized } from "./report-card-normalized.js";

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
    text: parts.join(" ").replace(/\s+/g, " ").trim(),
    numPages: pdf.numPages,
  };
}

/**
 * Text-first extraction; optional Tesseract pass when embedded text is too short (best-effort on rasterized PDFs).
 * Uses pdf-parse first; falls back to pdf.js when pdf-parse cannot read the file (common for some pdfkit outputs).
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  let text = "";
  let pages = 0;
  try {
    const data = await pdfParse(buffer);
    text = (data.text || "").replace(/\s+/g, " ").trim();
    pages = data.numpages;
  } catch {
    const j = await extractTextWithPdfJs(buffer);
    text = j.text;
    pages = j.numPages;
  }
  let usedOcr = false;
  if (text.length < MIN_TEXT_CHARS) {
    const ocr = await ocrFallback(buffer);
    if (ocr.length > text.length) {
      text = ocr;
      usedOcr = true;
    }
  }
  return { text, charCount: text.length, pages, usedOcr };
}

function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

function str(s: string | undefined, fallback = ""): string {
  return (s ?? "").trim() || fallback;
}

type SocialValues = ReportCardNormalized["enrolmentSocial"];

function emptySocial(): SocialValues {
  return { sc: null, st: null, obc: null, general: null, total: null };
}

const SOCIAL_ANCHOR_RE =
  /social\s*category|category[\s\-]*wise|enrolment\s*by\s*social|social\s*classification|caste[\s\-]*category/i;

function socialCategoryWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(SOCIAL_ANCHOR_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  const start = m.index;
  const window = blob.slice(start, start + 2800);
  return { window, anchored: true };
}

/**
 * Apply regex sets to `haystack`; only sets `values[key]` when still null.
 */
function applyRegexBucket(
  haystack: string,
  values: SocialValues,
  key: keyof SocialValues,
  patterns: RegExp[],
): void {
  if (values[key] != null) return;
  for (const re of patterns) {
    const m = haystack.match(re);
    const n = num(m?.[1]);
    if (n != null) {
      values[key] = n;
      return;
    }
  }
}

function applyRegexBucketNumericRecord<K extends string>(
  haystack: string,
  values: Record<K, number | null>,
  key: K,
  patterns: RegExp[],
): void {
  if (values[key] != null) return;
  for (const re of patterns) {
    const m = haystack.match(re);
    const n = num(m?.[1]);
    if (n != null) {
      values[key] = n;
      return;
    }
  }
}

/**
 * Table-style lines: label then number, or multi-column rows split on 2+ spaces.
 */
function applyTableHeuristics(lines: string[], values: SocialValues, anchorLineIdx: number): void {
  const end = Math.min(anchorLineIdx + 55, lines.length);
  for (let i = Math.max(0, anchorLineIdx); i < end; i++) {
    const line = lines[i];
    if (!line) continue;

    const mapLabel = (raw: string): keyof SocialValues | null => {
      const u = raw.replace(/[:.\-–]/g, "").trim().toUpperCase();
      if (u === "SC" || u === "SCHEDULED CASTE" || u.startsWith("SCHEDULED CASTE")) return "sc";
      if (u === "ST" || u === "SCHEDULED TRIBE" || u.startsWith("SCHEDULED TRIBE")) return "st";
      if (u === "OBC" || u.includes("BACKWARD CLASS")) return "obc";
      if (u === "GEN" || u === "GENERAL" || u === "GENERAL CATEGORY") return "general";
      if (u === "TOTAL" || u === "GRAND TOTAL") return "total";
      return null;
    };

    const loose = line.replace(/\s+/g, " ").trim();
    const tailNum = loose.match(
      /\b(SC|ST|OBC|General|GEN|Total|Scheduled\s+Caste|Scheduled\s+Tribe)\b\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i,
    );
    if (tailNum) {
      const label = mapLabel(tailNum[1]);
      const n = num(tailNum[2]);
      if (label && n != null && values[label] == null) values[label] = n;
    }

    const cols = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cols.length >= 2) {
      const last = cols[cols.length - 1];
      const n = num(last);
      if (n == null) continue;
      for (let c = 0; c < cols.length - 1; c++) {
        const label = mapLabel(cols[c]);
        if (label && values[label] == null) {
          values[label] = n;
          break;
        }
      }
    }
  }
}

/**
 * Primary extractor: SC / ST / OBC / General / Total. Missing slots stay null.
 * Uses regex on a social-section window plus loose table-style line parsing.
 */
export function extractEnrolmentSocialFromReportCard(text: string): {
  enrolmentSocial: SocialValues;
  enrolmentSocialConfidence: number;
} {
  const values = emptySocial();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = socialCategoryWindow(blob);

  const patterns = {
    sc: [
      /Scheduled\s*Caste(?:\s*\([^)]*\))?\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /(?<![A-Z0-9/])\bSC\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
    ],
    st: [
      /Scheduled\s*Tribe(?:\s*\([^)]*\))?\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /(?<![A-Z0-9/])\bST\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
    ],
    obc: [/\bOBC\b\s*[:\-–.]?\s*(\d[\d,]*)/i, /Other\s*Backward\s*Classes?\s*[:\-–.]?\s*(\d[\d,]*)/i],
    general: [/\bGeneral(?:\s*Category)?\b\s*[:\-–.]?\s*(\d[\d,]*)/i, /\bGEN\b\s*[:\-–.]?\s*(\d[\d,]*)/i],
    total: [
      /\bSocial\s*Category\b[^0-9]{0,180}?\bTotal\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /\bCategory\b[^0-9]{0,120}?\bTotal\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /(?<![A-Z0-9/])\bTotal\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
    ],
  } as const;

  (Object.keys(patterns) as (keyof SocialValues)[]).forEach((key) => {
    applyRegexBucket(window, values, key, [...patterns[key]]);
    if (values[key] == null) applyRegexBucket(blob, values, key, [...patterns[key]]);
  });

  const anchorLineIdx = lines.findIndex((l) => SOCIAL_ANCHOR_RE.test(l));
  if (anchorLineIdx >= 0) applyTableHeuristics(lines, values, anchorLineIdx);
  else applyTableHeuristics(lines, values, 0);

  const filled = [values.sc, values.st, values.obc, values.general, values.total].filter(
    (x) => x != null,
  ).length;
  let confidence = filled === 0 ? 0.05 : (filled / 5) * 0.55;
  if (filled >= 3) confidence += 0.12;
  if (anchored && filled >= 1) confidence += 0.08;

  const sum4 =
    (values.sc ?? 0) + (values.st ?? 0) + (values.obc ?? 0) + (values.general ?? 0);
  if (values.total != null && sum4 > 0) {
    const tol = Math.max(2, Math.round(values.total * 0.03));
    if (Math.abs(values.total - sum4) <= tol) confidence += 0.22;
  }

  return {
    enrolmentSocial: values,
    enrolmentSocialConfidence: Math.min(0.95, confidence),
  };
}

type MinorityValues = ReportCardNormalized["enrolmentMinority"];
type AgeValues = ReportCardNormalized["enrolmentAge"];

function emptyMinority(): MinorityValues {
  return {
    muslim: null,
    christian: null,
    sikh: null,
    buddhist: null,
    jain: null,
    others: null,
    total: null,
  };
}

function emptyAge(): AgeValues {
  return {
    age_10: null,
    age_11: null,
    age_12: null,
    age_13: null,
    age_14: null,
    age_15: null,
    age_16: null,
    age_17: null,
    age_18: null,
    total: null,
  };
}

const MINORITY_ANCHOR_RE =
  /religious\s*minority|minority\s*community|minority\s*composition|minority\s*category/i;

function minorityWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(MINORITY_ANCHOR_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  const start = m.index;
  return { window: blob.slice(start, start + 2200), anchored: true };
}

/**
 * Muslim / Christian / Sikh / Buddhist / Jain / Others / Total for minority enrolment tables.
 */
export function extractEnrolmentMinorityFromReportCard(text: string): {
  enrolmentMinority: MinorityValues;
  enrolmentMinorityConfidence: number;
} {
  const values = emptyMinority();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = minorityWindow(blob);

  const patterns = {
    muslim: [/\bMuslim\b\s*[:\-–.]?\s*(\d[\d,]*)/i],
    christian: [/\bChristian\b\s*[:\-–.]?\s*(\d[\d,]*)/i],
    sikh: [/\bSikh\b\s*[:\-–.]?\s*(\d[\d,]*)/i],
    buddhist: [/\bBuddhist\b\s*[:\-–.]?\s*(\d[\d,]*)/i],
    jain: [/\bJain\b\s*[:\-–.]?\s*(\d[\d,]*)/i],
    others: [/\bOthers?\b\s*[:\-–.]?\s*(\d[\d,]*)/i],
    total: [
      /\bMinority\s+Total\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /\bReligious\s+Minority\b[^0-9]{0,220}?\bMinority\s+Total\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
    ],
  } as const;

  (Object.keys(patterns) as (keyof MinorityValues)[]).forEach((key) => {
    applyRegexBucketNumericRecord(window, values, key, [...patterns[key]]);
    if (values[key] == null) applyRegexBucketNumericRecord(blob, values, key, [...patterns[key]]);
  });

  const anchorLineIdx = lines.findIndex((l) => MINORITY_ANCHOR_RE.test(l));
  if (anchorLineIdx >= 0) {
    const end = Math.min(anchorLineIdx + 40, lines.length);
    for (let i = anchorLineIdx; i < end; i++) {
      const line = lines[i];
      if (!line) continue;
      const minorTot = line.match(/\bMinority\s+Total\b\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i);
      if (minorTot && values.total == null) {
        const n = num(minorTot[1]);
        if (n != null) values.total = n;
        continue;
      }
      const tail = line.match(
        /\b(Muslim|Christian|Sikh|Buddhist|Jain|Others?|Total)\b\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i,
      );
      if (tail) {
        const raw = tail[1].toLowerCase().replace(/\s+/g, "");
        const n = num(tail[2]);
        if (n == null) continue;
        const map: Record<string, keyof MinorityValues> = {
          muslim: "muslim",
          christian: "christian",
          sikh: "sikh",
          buddhist: "buddhist",
          jain: "jain",
          other: "others",
          others: "others",
          total: "total",
        };
        const k = map[raw];
        if (k && values[k] == null) values[k] = n;
      }
    }
  }

  const filled = (Object.values(values) as (number | null)[]).filter((x) => x != null).length;
  let confidence = filled === 0 ? 0.03 : (filled / 7) * 0.5;
  if (filled >= 4) confidence += 0.12;
  if (anchored && filled >= 1) confidence += 0.1;

  return {
    enrolmentMinority: values,
    enrolmentMinorityConfidence: Math.min(0.92, confidence),
  };
}

const AGE_ANCHOR_RE =
  /age[\s\-]*wise|age\s*distribution|enrolment\s*by\s*age|age\s*group|age[\s\-]*composition/i;

function ageWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(AGE_ANCHOR_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  const start = m.index;
  return { window: blob.slice(start, start + 3200), anchored: true };
}

const AGE_LINE_KEY: Record<string, keyof AgeValues | null> = {
  "10": "age_10",
  "11": "age_11",
  "12": "age_12",
  "13": "age_13",
  "14": "age_14",
  "15": "age_15",
  "16": "age_16",
  "17": "age_17",
  "18": "age_18",
};

/**
 * Age bands 10–18 plus Total (matches `SchoolEnrolmentAge.ageBand` labels).
 */
export function extractEnrolmentAgeFromReportCard(text: string): {
  enrolmentAge: AgeValues;
  enrolmentAgeConfidence: number;
} {
  const values = emptyAge();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = ageWindow(blob);

  for (let a = 10; a <= 18; a++) {
    const key = `age_${a}` as keyof AgeValues;
    if (values[key] != null) continue;
    const re = new RegExp(
      `(?:Age\\s*(?:group\\s*)?${a}|\\b${a}\\s*years?)\\s*[:\\-–.]?\\s*(\\d[\\d,]*)`,
      "i",
    );
    const m = window.match(re) || blob.match(re);
    const n = num(m?.[1]);
    if (n != null) values[key] = n;
  }

  const totalPatterns = [
    /\bAge\b[^0-9]{0,200}?\bTotal\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
    /\bAge[\s\-]*wise\b[^0-9]{0,200}?\bTotal\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
  ];
  for (const re of totalPatterns) {
    if (values.total != null) break;
    const m = window.match(re) || blob.match(re);
    const n = num(m?.[1]);
    if (n != null) values.total = n;
  }

  const anchorLineIdx = lines.findIndex((l) => AGE_ANCHOR_RE.test(l));
  if (anchorLineIdx >= 0) {
    const end = Math.min(anchorLineIdx + 45, lines.length);
    for (let i = anchorLineIdx; i < end; i++) {
      const line = lines[i];
      if (!line) continue;
      const ageTot = line.match(/^\s*Age\s+Total\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i);
      if (ageTot && values.total == null) {
        const n = num(ageTot[1]);
        if (n != null) values.total = n;
        continue;
      }
      const bandTotal = line.match(/^\s*Total\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i);
      if (bandTotal && values.total == null) {
        const n = num(bandTotal[1]);
        if (n != null) values.total = n;
        continue;
      }
      const oneCol = line.match(/^\s*(\d{1,2})\s+[:\-–.]?\s*(\d[\d,]*)\s*$/);
      if (oneCol) {
        const band = oneCol[1];
        const k = AGE_LINE_KEY[band];
        const n = num(oneCol[2]);
        if (k && n != null && values[k] == null) values[k] = n;
      }
    }
  }

  /** pdf-parse often flattens lines — scan the age window for `10 : 50` style tokens. */
  for (let a = 10; a <= 18; a++) {
    const key = `age_${a}` as keyof AgeValues;
    if (values[key] != null) continue;
    const re = new RegExp(`\\b${a}\\s*:\\s*(\\d[\\d,]*)`, "i");
    const m = window.match(re) || blob.match(re);
    const n = num(m?.[1]);
    if (n != null) values[key] = n;
  }
  if (values.total == null) {
    const m = window.match(/\bAge\s+Total\b\s*:\s*(\d[\d,]*)/i);
    const n = num(m?.[1]);
    if (n != null) values.total = n;
  }

  const filled = (Object.values(values) as (number | null)[]).filter((x) => x != null).length;
  let confidence = filled === 0 ? 0.03 : (filled / 10) * 0.52;
  if (filled >= 6) confidence += 0.14;
  if (anchored && filled >= 2) confidence += 0.1;
  const sumBands =
    (values.age_10 ?? 0) +
    (values.age_11 ?? 0) +
    (values.age_12 ?? 0) +
    (values.age_13 ?? 0) +
    (values.age_14 ?? 0) +
    (values.age_15 ?? 0) +
    (values.age_16 ?? 0) +
    (values.age_17 ?? 0) +
    (values.age_18 ?? 0);
  if (values.total != null && sumBands > 0) {
    const tol = Math.max(2, Math.round(values.total * 0.04));
    if (Math.abs(values.total - sumBands) <= tol) confidence += 0.18;
  }

  return {
    enrolmentAge: values,
    enrolmentAgeConfidence: Math.min(0.92, confidence),
  };
}

function minorityHasData(v: MinorityValues): boolean {
  return (Object.values(v) as (number | null)[]).some((x) => x != null);
}

function ageHasData(v: AgeValues): boolean {
  return (Object.values(v) as (number | null)[]).some((x) => x != null);
}

type InfraValues = ReportCardNormalized["infra"];
type DigitalValues = ReportCardNormalized["digital"];
type TeachersValues = ReportCardNormalized["teachers"];

function emptyInfra(): InfraValues {
  return {
    electricity: null,
    water: null,
    internet: null,
    solar: null,
    playground: null,
    library: null,
  };
}

function emptyDigital(): DigitalValues {
  return {
    desktops: null,
    laptops: null,
    tablets: null,
    printers: null,
    projectors: null,
  };
}

function emptyTeachers(): TeachersValues {
  return {
    total: null,
    male: null,
    female: null,
    trained: null,
    untrained: null,
  };
}

/** Normalize YES/NO style tokens to boolean; unknown wording → null (do not guess). */
function normalizeYesNoToken(raw: string): boolean | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  if (/^(yes|y|1|true|available|avail\.?)$/.test(t)) return true;
  if (/^(no|n|0|false|na|n\/a)$/.test(t)) return false;
  if (/^not\s+available$/.test(t) || /^unavailable$/.test(t)) return false;
  return null;
}

function firstYesNoInPatterns(blob: string, patterns: RegExp[]): boolean | null {
  for (const re of patterns) {
    const m = blob.match(re);
    if (!m?.[1]) continue;
    const v = normalizeYesNoToken(m[1]);
    if (v !== null) return v;
  }
  return null;
}

function firstIntInPatterns(blob: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = blob.match(re);
    const n = num(m?.[1]);
    if (n != null) return n;
  }
  return null;
}

const INFRA_SECTION_RE =
  /(?:basic\s*)?facilities|availability|infrastructure|school\s*facilities|physical\s*facilities|functional\s*facilities/i;

function infraSectionWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(INFRA_SECTION_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  return { window: blob.slice(m.index, m.index + 3500), anchored: true };
}

/**
 * Electricity, drinking water, internet, solar, playground, library — keyword + table-style lines; YES/NO → boolean.
 */
export function extractInfraFromReportCard(text: string): {
  infra: InfraValues;
  infraConfidence: number;
} {
  const values = emptyInfra();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = infraSectionWindow(blob);

  const apply = (key: keyof InfraValues, patterns: RegExp[]) => {
    if (values[key] != null) return;
    const v = firstYesNoInPatterns(window, patterns) ?? firstYesNoInPatterns(blob, patterns);
    if (v !== null) values[key] = v;
  };

  apply("electricity", [
    /\bElectricity\s*(?:Supply|Available|Connection)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bPower\s*Supply\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bElectric\s*Supply\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("water", [
    /\bDrinking\s*Water\s*(?:Available|Supply)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bPotable\s*Water\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bWater\s*Supply\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("internet", [
    /\bInternet\s*(?:Available|Facility|Connection)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bICT\s*(?:Facility|Available)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bBroadband\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("solar", [
    /\bSolar\s*(?:Panel|Energy|Power)?\s*(?:Available)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bSolar\s*PV\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("playground", [
    /\bPlayground\s*(?:Available)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bSports\s*(?:Ground|Facility)\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);
  apply("library", [
    /\bLibrary\s*(?:Available|Facility|Room)?\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
    /\bReading\s*Room\s*[:\-–.]?\s*(Yes|No|Y|N|1|0)\b/i,
  ]);

  const anchorIdx = lines.findIndex((l) => INFRA_SECTION_RE.test(l));
  const start = anchorIdx >= 0 ? anchorIdx : 0;
  const end = Math.min(start + 55, lines.length);
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!line) continue;
    const tailM = line.match(
      /[:\-–.]?\s*(Yes|No|Y|N|1|0|Available|Not\s*available)\s*$/i,
    );
    if (!tailM) continue;
    const b = normalizeYesNoToken(tailM[1]);
    if (b === null) continue;
    const low = line.toLowerCase();
    if (values.electricity == null && /electric|power\s*supply/.test(low)) values.electricity = b;
    else if (values.water == null && /(drinking|potable)\s*water|water\s*supply/.test(low)) values.water = b;
    else if (values.internet == null && /internet|ict|broadband/.test(low)) values.internet = b;
    else if (values.solar == null && /solar/.test(low)) values.solar = b;
    else if (values.playground == null && /playground|sports\s*(ground|facility)/.test(low)) {
      values.playground = b;
    } else if (values.library == null && /library|reading\s*room/.test(low)) values.library = b;
  }

  const filled = (Object.values(values) as (boolean | null)[]).filter((x) => x !== null).length;
  let confidence = filled === 0 ? 0.03 : (filled / 6) * 0.48;
  if (filled >= 3) confidence += 0.1;
  if (anchored && filled >= 1) confidence += 0.08;

  return { infra: values, infraConfidence: Math.min(0.9, confidence) };
}

const DIGITAL_SECTION_RE =
  /ICT|digital\s*facilities|computer\s*facility|educational\s*technology|IT\s*assets|hardware/i;

function digitalSectionWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(DIGITAL_SECTION_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  return { window: blob.slice(m.index, m.index + 3200), anchored: true };
}

/**
 * Desktop/laptop/tablet/printer/projector counts — keyword + `Label : N` / table tails.
 */
export function extractDigitalFromReportCard(text: string): {
  digital: DigitalValues;
  digitalConfidence: number;
} {
  const values = emptyDigital();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = digitalSectionWindow(blob);

  const apply = (key: keyof DigitalValues, patterns: RegExp[]) => {
    if (values[key] != null) return;
    const n = firstIntInPatterns(window, patterns) ?? firstIntInPatterns(blob, patterns);
    if (n != null) values[key] = n;
  };

  apply("desktops", [
    /\bDesktops?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bDesktop\s*Computers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bPCs?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);
  apply("laptops", [/\bLaptops?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i, /\bNotebooks?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i]);
  apply("tablets", [/\bTablets?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i]);
  apply("printers", [/\bPrinters?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i]);
  apply("projectors", [
    /\bProjectors?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bLCD\s*(?:Projectors?|Panels?)\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bSmart\s*Class(?:room)?\s*(?:TV|Kit)?\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);

  const anchorIdx = lines.findIndex((l) => DIGITAL_SECTION_RE.test(l));
  const start = anchorIdx >= 0 ? anchorIdx : 0;
  const end = Math.min(start + 50, lines.length);
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!line) continue;
    const tail = line.match(
      /\b(Desktops?|Laptops?|Tablets?|Printers?|Projectors?|PCs?)\b\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i,
    );
    if (tail) {
      const lab = tail[1].toLowerCase();
      const n = num(tail[2]);
      if (n == null) continue;
      if ((lab === "desktop" || lab === "desktops") && values.desktops == null) values.desktops = n;
      else if ((lab === "laptop" || lab === "laptops") && values.laptops == null) values.laptops = n;
      else if ((lab === "tablet" || lab === "tablets") && values.tablets == null) values.tablets = n;
      else if ((lab === "printer" || lab === "printers") && values.printers == null) values.printers = n;
      else if ((lab === "projector" || lab === "projectors") && values.projectors == null) {
        values.projectors = n;
      } else if ((lab === "pc" || lab === "pcs") && values.desktops == null) values.desktops = n;
    }
  }

  const filled = (Object.values(values) as (number | null)[]).filter((x) => x != null).length;
  let confidence = filled === 0 ? 0.03 : (filled / 5) * 0.45;
  if (filled >= 2) confidence += 0.08;
  if (anchored && filled >= 1) confidence += 0.07;

  return { digital: values, digitalConfidence: Math.min(0.9, confidence) };
}

const TEACHER_SECTION_RE =
  /teaching\s*staff|teachers?|staff\s*details|personnel|human\s*resources/i;

function teacherSectionWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(TEACHER_SECTION_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  return { window: blob.slice(m.index, m.index + 3800), anchored: true };
}

/**
 * Teacher total, gender split, trained vs untrained — regex + label/number table lines.
 */
export function extractTeachersFromReportCard(text: string): {
  teachers: TeachersValues;
  teachersConfidence: number;
} {
  const values = emptyTeachers();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = teacherSectionWindow(blob);

  if (values.total == null) {
    values.total =
      firstIntInPatterns(window, [
        /\bTotal\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
        /\bTeachers?\s*Total\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
        /\bNo\.?\s*of\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
        /\bTeaching\s*Staff\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
      ]) ?? firstIntInPatterns(blob, [
        /\bTotal\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
        /\bNo\.?\s*of\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
      ]);
  }

  const applyN = (key: keyof TeachersValues, patterns: RegExp[]) => {
    if (values[key] != null) return;
    const n = firstIntInPatterns(window, patterns) ?? firstIntInPatterns(blob, patterns);
    if (n != null) values[key] = n;
  };

  applyN("male", [
    /\bMale\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bTeachers?\s*\(?\s*Male\b\)?\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bMale\s*[:\-–.]?\s*(\d[\d,]*)\b(?=[^0-9]{0,40}Teacher)/i,
  ]);
  applyN("female", [
    /\bFemale\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bTeachers?\s*\(?\s*Female\b\)?\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);
  applyN("trained", [
    /\bTrained\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bQualified\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bTeachers?\s*Trained\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bCTET\s*(?:Qualified|Passed)?\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);
  applyN("untrained", [
    /\bUntrained\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bNot\s*Trained\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
    /\bUnder\s*[-–]?\s*qualified\b\s*[:\-–.]?\s*(\d[\d,]*)\b/i,
  ]);

  const anchorIdx = lines.findIndex((l) => TEACHER_SECTION_RE.test(l));
  const start = anchorIdx >= 0 ? anchorIdx : 0;
  const end = Math.min(start + 60, lines.length);
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!line) continue;
    const m = line.match(
      /\b(Male|Female|Trained|Untrained|Total)\s*Teachers?\b\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i,
    );
    if (m) {
      const lab = m[1].toLowerCase();
      const n = num(m[2]);
      if (n == null) continue;
      if (lab === "male" && values.male == null) values.male = n;
      else if (lab === "female" && values.female == null) values.female = n;
      else if (lab === "trained" && values.trained == null) values.trained = n;
      else if (lab === "untrained" && values.untrained == null) values.untrained = n;
      else if (lab === "total" && values.total == null) values.total = n;
    }
    const simple = line.match(
      /^\s*(Male|Female|Trained|Untrained)\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i,
    );
    if (simple) {
      const lab = simple[1].toLowerCase();
      const n = num(simple[2]);
      if (n == null) continue;
      if (lab === "male" && values.male == null) values.male = n;
      else if (lab === "female" && values.female == null) values.female = n;
      else if (lab === "trained" && values.trained == null) values.trained = n;
      else if (lab === "untrained" && values.untrained == null) values.untrained = n;
    }
  }

  const filled = (Object.values(values) as (number | null)[]).filter((x) => x != null).length;
  let confidence = filled === 0 ? 0.03 : (filled / 5) * 0.46;
  if (values.total != null && (values.male != null || values.female != null)) confidence += 0.08;
  if (values.trained != null && values.untrained != null) {
    const sum = values.trained + values.untrained;
    if (values.total != null && Math.abs(sum - values.total) <= Math.max(2, Math.round(values.total * 0.05))) {
      confidence += 0.1;
    }
  }
  if (anchored && filled >= 1) confidence += 0.06;

  return { teachers: values, teachersConfidence: Math.min(0.9, confidence) };
}

function infraHasData(v: InfraValues): boolean {
  return (Object.values(v) as (boolean | null)[]).some((x) => x !== null);
}

function digitalHasData(v: DigitalValues): boolean {
  return (Object.values(v) as (number | null)[]).some((x) => x != null);
}

function teachersHasData(v: TeachersValues): boolean {
  return (Object.values(v) as (number | null)[]).some((x) => x != null);
}

/** Total Students / Boys / Girls when present in report-card text. */
export function extractStudentHeadcountFromReportCard(text: string):
  | ReportCardNormalized["students"]
  | undefined {
  const ts =
    text.match(/\bTotal\s+Students?\b\s*[:\s]*(\d[\d,]*)/i) ||
    text.match(/\bTotal\s*(?:Students?|Enrolment)\b\s*[:\s]*(\d[\d,]*)/i);
  const tb = text.match(/\bBoys?\b\s*[:\s]*(\d[\d,]*)/i);
  const tg = text.match(/\bGirls?\b\s*[:\s]*(\d[\d,]*)/i);
  const totalStudents = num(ts?.[1]);
  const totalBoys = num(tb?.[1]);
  const totalGirls = num(tg?.[1]);
  if (totalStudents == null && totalBoys == null && totalGirls == null) return undefined;
  return {
    total: totalStudents ?? (totalBoys ?? 0) + (totalGirls ?? 0),
    boys: totalBoys ?? 0,
    girls: totalGirls ?? 0,
  };
}

/** Legacy full report-card parse (UDISE, school profile, students, social with zero-fill). */
function parseReportCardTextLegacy(text: string, fallbackUdise: string): ReportCardParseResult {
  const out: ReportCardParseResult = {};

  const udiseM = text.match(/UDISE[:\s]*(\d{11})/i) || text.match(/\b(\d{11})\b/);
  if (udiseM) {
    out.udise = udiseM[1];
  } else {
    out.udise = fallbackUdise;
  }

  const nameM = text.match(/School Name[:\s]+([^\n]+)/i);
  const stM = text.match(/State[:\s]+([^\n]+)/i);
  const distM = text.match(/District[:\s]+([^\n]+)/i);
  if (nameM || stM || distM) {
    out.schoolProfile = {
      name: str(nameM?.[1]).slice(0, 200),
      state: str(stM?.[1]).slice(0, 120),
      district: str(distM?.[1]).slice(0, 120),
    };
  }

  const ts = text.match(/Total\s*(?:Students?|Enrolment)[:\s]*(\d[\d,]*)/i);
  const tb = text.match(/Boys[:\s]*(\d[\d,]*)/i);
  const tg = text.match(/Girls[:\s]*(\d[\d,]*)/i);
  const totalStudents = num(ts?.[1]);
  const totalBoys = num(tb?.[1]);
  const totalGirls = num(tg?.[1]);
  if (totalStudents != null || totalBoys != null || totalGirls != null) {
    out.students = {
      total: totalStudents ?? 0,
      boys: totalBoys ?? 0,
      girls: totalGirls ?? 0,
    };
  }

  return out;
}

/**
 * Social-category enrolment is always parsed with the dedicated extractor.
 * Set `REPORT_CARD_LEGACY_FULL_PARSE` to merge UDISE / school profile / students from the legacy parser.
 */
export function parseReportCardText(text: string, fallbackUdise: string): ReportCardParseResult {
  const env = loadEnv();
  const { enrolmentSocial, enrolmentSocialConfidence } = extractEnrolmentSocialFromReportCard(text);
  const { enrolmentMinority, enrolmentMinorityConfidence } = extractEnrolmentMinorityFromReportCard(text);
  const { enrolmentAge, enrolmentAgeConfidence } = extractEnrolmentAgeFromReportCard(text);
  const { infra, infraConfidence } = extractInfraFromReportCard(text);
  const { digital, digitalConfidence } = extractDigitalFromReportCard(text);
  const { teachers, teachersConfidence } = extractTeachersFromReportCard(text);

  const out: ReportCardParseResult = {
    enrolmentSocial,
    enrolmentSocialConfidence,
  };

  if (minorityHasData(enrolmentMinority)) {
    out.enrolmentMinority = enrolmentMinority;
    out.enrolmentMinorityConfidence = enrolmentMinorityConfidence;
  }

  if (ageHasData(enrolmentAge)) {
    out.enrolmentAge = enrolmentAge;
    out.enrolmentAgeConfidence = enrolmentAgeConfidence;
  }

  if (infraHasData(infra)) {
    out.infra = infra;
    out.infraConfidence = infraConfidence;
  }

  if (digitalHasData(digital)) {
    out.digital = digital;
    out.digitalConfidence = digitalConfidence;
  }

  if (teachersHasData(teachers)) {
    out.teachers = teachers;
    out.teachersConfidence = teachersConfidence;
  }

  const headcount = extractStudentHeadcountFromReportCard(text);
  if (headcount && (headcount.total > 0 || headcount.boys > 0 || headcount.girls > 0)) {
    out.students = headcount;
  }

  if (env.REPORT_CARD_LEGACY_FULL_PARSE) {
    const legacy = parseReportCardTextLegacy(text, fallbackUdise);
    Object.assign(out, legacy);
    out.enrolmentSocial = enrolmentSocial;
    out.enrolmentSocialConfidence = enrolmentSocialConfidence;
    if (minorityHasData(enrolmentMinority)) {
      out.enrolmentMinority = enrolmentMinority;
      out.enrolmentMinorityConfidence = enrolmentMinorityConfidence;
    }
    if (ageHasData(enrolmentAge)) {
      out.enrolmentAge = enrolmentAge;
      out.enrolmentAgeConfidence = enrolmentAgeConfidence;
    }
    if (infraHasData(infra)) {
      out.infra = infra;
      out.infraConfidence = infraConfidence;
    }
    if (digitalHasData(digital)) {
      out.digital = digital;
      out.digitalConfidence = digitalConfidence;
    }
    if (teachersHasData(teachers)) {
      out.teachers = teachers;
      out.teachersConfidence = teachersConfidence;
    }
    if (headcount && (headcount.total > 0 || headcount.boys > 0 || headcount.girls > 0)) {
      out.students = headcount;
    }
  }

  return out;
}

/**
 * Scoring and warnings kept outside the normalized school facts.
 */
export function reportCardExtractionMeta(
  normalized: ReportCardParseResult,
  text: string,
  fallbackUdise: string,
): { confidence: number; warnings: string[] } {
  const env = loadEnv();
  const warnings: string[] = [];
  const legacy = env.REPORT_CARD_LEGACY_FULL_PARSE;

  if (!legacy) {
    let confidence = normalized.enrolmentSocialConfidence ?? 0;
    if (normalized.enrolmentMinorityConfidence != null) {
      confidence += normalized.enrolmentMinorityConfidence * 0.22;
    }
    if (normalized.enrolmentAgeConfidence != null) {
      confidence += normalized.enrolmentAgeConfidence * 0.22;
    }
    if (normalized.students && (normalized.students.total > 0 || normalized.students.boys > 0)) {
      confidence += 0.06;
    }
    if (normalized.infraConfidence != null) confidence += normalized.infraConfidence * 0.08;
    if (normalized.digitalConfidence != null) confidence += normalized.digitalConfidence * 0.08;
    if (normalized.teachersConfidence != null) confidence += normalized.teachersConfidence * 0.08;
    const e = normalized.enrolmentSocial;
    if (!e) warnings.push("Social category enrolment not present in parse result");
    else if ([e.sc, e.st, e.obc, e.general, e.total].every((x) => x == null)) {
      warnings.push("All social category counts are null");
    }
    if (normalized.udise && normalized.udise !== fallbackUdise) {
      warnings.push(
        `Extracted UDISE ${normalized.udise} differs from filename UDISE ${fallbackUdise}`,
      );
    }
    return { confidence: Math.min(0.95, confidence), warnings };
  }

  let confidence = 0.35;

  const udiseM = text.match(/UDISE[:\s]*(\d{11})/i) || text.match(/\b(\d{11})\b/);
  if (!udiseM) {
    warnings.push("UDISE not found in PDF; using filename");
  } else {
    confidence += 0.12;
  }

  if (normalized.schoolProfile?.name) confidence += 0.08;
  if (normalized.schoolProfile?.state) confidence += 0.04;
  if (normalized.schoolProfile?.district) confidence += 0.04;

  if (normalized.students) {
    const { total, boys, girls } = normalized.students;
    if (total > 0 || boys > 0 || girls > 0) confidence += 0.12;
    else warnings.push("Student headcounts parsed as zero");
  } else {
    warnings.push("Student headcounts not parsed");
  }

  if (normalized.enrolmentSocialConfidence != null) {
    confidence += normalized.enrolmentSocialConfidence * 0.32;
  } else if (normalized.enrolmentSocial) {
    const e = normalized.enrolmentSocial;
    const sum =
      (e.sc ?? 0) + (e.st ?? 0) + (e.obc ?? 0) + (e.general ?? 0) + (e.total ?? 0);
    if (sum > 0) confidence += 0.08;
  }

  if (normalized.udise && normalized.udise !== fallbackUdise) {
    warnings.push(
      `Extracted UDISE ${normalized.udise} differs from filename UDISE ${fallbackUdise}`,
    );
  }

  return { confidence: Math.min(0.95, confidence), warnings };
}
