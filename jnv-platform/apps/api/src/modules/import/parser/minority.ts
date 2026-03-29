import type { ReportCardNormalized } from "../report-card-normalized.js";
import { applyRegexBucketNumber, num } from "./text-helpers.js";

type MinorityValues = ReportCardNormalized["enrolmentMinority"];

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
    applyRegexBucketNumber(window, values, key, [...patterns[key]]);
    if (values[key] == null) applyRegexBucketNumber(blob, values, key, [...patterns[key]]);
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

export function minorityHasData(v: MinorityValues): boolean {
  return (Object.values(v) as (number | null)[]).some((x) => x != null);
}
