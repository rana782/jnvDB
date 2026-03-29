import type { ReportCardNormalized } from "../report-card-normalized.js";
import { num } from "./text-helpers.js";

type AgeValues = ReportCardNormalized["enrolmentAge"];

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

export function ageHasData(v: AgeValues): boolean {
  return (Object.values(v) as (number | null)[]).some((x) => x != null);
}
