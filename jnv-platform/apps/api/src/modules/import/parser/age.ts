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
  /age[\s\-]*wise|age\s*distribution|enrolment\s*by\s*age|enrolment\s*\(by\s*age\)|age\s*group|age[\s\-]*composition|enrolment\s*by\s*grade|completed\s*years/i;

function ageWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(AGE_ANCHOR_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  const start = m.index;
  return { window: blob.slice(start, start + 3200), anchored: true };
}

function compactTailTotal(digits: string): number | null {
  const clean = digits.replace(/\D/g, "");
  if (clean.length < 2) return null;
  const pick = (len: number) => {
    if (clean.length < len) return null;
    const n = num(clean.slice(-len));
    return n ?? null;
  };
  const n3 = pick(3);
  if (n3 != null && n3 >= 50 && n3 <= 2500) return n3;
  const n4 = pick(4);
  if (n4 != null && n4 >= 50 && n4 <= 2500) return n4;
  const n2 = pick(2);
  if (n2 != null && n2 >= 50 && n2 <= 2500) return n2;
  return null;
}

function recoverDenseAgeTotal(lines: string[], anchorLineIdx: number): number | null {
  const start = Math.max(0, anchorLineIdx);
  const end = Math.min(lines.length, anchorLineIdx + 90);
  let fallback: number | null = null;
  for (let i = start; i < end; i++) {
    const line = lines[i]?.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (!/(?:^|\b)(?:g\.?\s*total|age\s*total|total)/i.test(line)) continue;
    const runs = line.match(/\d{3,}/g);
    if (!runs || runs.length === 0) continue;
    const candidate = compactTailTotal(runs[runs.length - 1]!);
    if (candidate == null) continue;
    if (/(?:^|\b)g\.?\s*total/i.test(line) || /\bage\s*total\b/i.test(line)) return candidate;
    if (fallback == null) fallback = candidate;
  }
  return fallback;
}

function denseTailTripletTotal(run: string): number | null {
  const clean = run.replace(/\D/g, "");
  if (clean.length < 5) return null;
  let best: number | null = null;
  for (let tLen = 2; tLen <= 4; tLen++) {
    if (clean.length <= tLen + 1) continue;
    const t = num(clean.slice(-tLen));
    if (t == null || t < 1 || t > 800) continue;
    const stem = clean.slice(0, -tLen);
    for (let gLen = 1; gLen <= 4; gLen++) {
      if (stem.length <= gLen) continue;
      const g = num(stem.slice(-gLen));
      if (g == null || g > 600) continue;
      const bPart = stem.slice(0, -gLen);
      for (let bLen = 1; bLen <= 4; bLen++) {
        if (bPart.length < bLen) continue;
        const b = num(bPart.slice(-bLen));
        if (b == null || b > 600) continue;
        if (b + g !== t) continue;
        if (best == null || t > best) best = t;
      }
    }
  }
  return best;
}

function lineTailTotal(line: string): number | null {
  const tokens = line.match(/\d[\d,]{0,3}/g) ?? [];
  if (tokens.length >= 3) {
    const trip = tokens.slice(-3).map((x) => num(x) ?? null);
    const [b, g, t] = trip;
    if (b != null && g != null && t != null && b + g === t && t > 0) return t;
  }
  const runs = line.match(/\d{5,}/g) ?? [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const t = denseTailTripletTotal(runs[i]!);
    if (t != null) return t;
  }
  return null;
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
    /\bAge\b[^0-9]{0,200}?\bTotal\b\s*[:\-–.]?\s*(\d{1,4}(?:,\d{3})*)/i,
    /\bAge[\s\-]*wise\b[^0-9]{0,200}?\bTotal\b\s*[:\-–.]?\s*(\d{1,4}(?:,\d{3})*)/i,
  ];
  for (const re of totalPatterns) {
    if (values.total != null) break;
    const m = window.match(re) || blob.match(re);
    const n = num(m?.[1]);
    if (n != null) values.total = n;
  }

  let anchorLineIdx = lines.findIndex((l) => AGE_ANCHOR_RE.test(l));
  if (anchorLineIdx < 0) {
    anchorLineIdx = lines.findIndex((l) => /^\s*agebgbg/i.test(l));
  }
  if (anchorLineIdx < 0) {
    anchorLineIdx = lines.findIndex((l) => /^\s*10\d{8,}/.test(l));
  }
  if (anchorLineIdx >= 0) {
    const end = Math.min(anchorLineIdx + 80, lines.length);
    for (let i = anchorLineIdx; i < end; i++) {
      const line = lines[i];
      if (!line) continue;
      const ageTot = line.match(/^\s*Age\s+Total\s*[:\-–.]?\s*(\d{1,4}(?:,\d{3})*)\s*$/i);
      if (ageTot && values.total == null) {
        const n = num(ageTot[1]);
        if (n != null) values.total = n;
        continue;
      }
      const bandTotal = line.match(/^\s*Total\s*[:\-–.]?\s*(\d{1,4}(?:,\d{3})*)\s*$/i);
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
        continue;
      }

      const compactLine = line.replace(/\s+/g, "");
      const bandLine = compactLine.match(/^(10|11|12|13|14|15|16|17|18)/);
      if (bandLine) {
        const k = AGE_LINE_KEY[bandLine[1]!];
        const n = lineTailTotal(line);
        if (k && n != null && values[k] == null) values[k] = n;
        continue;
      }

      if (/\b(?:g\.?\s*total|age\s*total|total)\b/i.test(line) && values.total == null) {
        const n = lineTailTotal(line);
        if (n != null) values.total = n;
      }
    }
  }
  if (values.total == null && anchorLineIdx >= 0) {
    values.total = recoverDenseAgeTotal(lines, anchorLineIdx);
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
    const m = window.match(/\bAge\s+Total\b\s*:\s*(\d{1,4}(?:,\d{3})*)/i);
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
