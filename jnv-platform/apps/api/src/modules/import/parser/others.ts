import type { ReportCardNormalized } from "../report-card-normalized.js";
import { applyRegexBucketNumber, num } from "./text-helpers.js";

type OthersValues = ReportCardNormalized["enrolmentOthers"];

function emptyOthers(): OthersValues {
  return {
    cwsn: null,
    ews: null,
    bpl: null,
    repeater: null,
    otherCategories: null,
    total: null,
  };
}

/** Dedicated "Other enrolment" block (not religious-minority "Others"). */
const OTHERS_SECTION_HEADER_RE =
  /^Other\s+Enrolment\s*$|^Other\s+student\s+categories\s*$|^Other\s+categories\s+enrolment\s*$/i;

const OTHERS_BLOB_ANCHOR_RE =
  /other\s+enrolment|other\s+student\s+categories|\bbpl\b|\brepeater\b|\bcwsn\b|economically\s*weaker|\bews\b/i;

function othersWindow(blob: string): { window: string; anchored: boolean } {
  const m = blob.match(OTHERS_BLOB_ANCHOR_RE);
  if (!m || m.index == null) return { window: blob, anchored: false };
  const start = Math.max(0, m.index - 200);
  return { window: blob.slice(start, start + 2800), anchored: true };
}

function sectionPresentFromLines(lines: string[]): boolean {
  return lines.some((l) => OTHERS_SECTION_HEADER_RE.test(l.trim()));
}

/**
 * BPL / Repeater / CWSN / EWS / other categories / total — maps to `SchoolEnrolmentOthers`.
 * When the PDF includes an "Other Enrolment" header, `sectionPresent` is true and missing counts stay `null`
 * (unknown within the section), not omitted.
 */
export function extractEnrolmentOthersFromReportCard(text: string): {
  enrolmentOthers: OthersValues;
  enrolmentOthersConfidence: number;
  sectionPresent: boolean;
} {
  const values = emptyOthers();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = othersWindow(blob);
  let sectionPresent = sectionPresentFromLines(lines) || anchored;

  const patterns = {
    bpl: [/\bBPL\b\s*[:\-–.]?\s*(\d[\d,]*)/i, /\bBelow\s+Poverty\s+Line\b\s*[:\-–.]?\s*(\d[\d,]*)/i],
    repeater: [/\bRepeaters?\b\s*[:\-–.]?\s*(\d[\d,]*)/i],
    cwsn: [
      /\bCWSN\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /\bChildren\s+with\s+Special\s+Needs?\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
    ],
    ews: [
      /\bEWS\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /\bEconomically\s+Weaker\s+Section\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
    ],
    otherCategories: [
      /\bOther\s+categories?\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /\bOther\s+Category\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
    ],
    total: [
      /\bOther\s+Enrolment\b[^0-9]{0,120}?\bTotal\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /\bOther\s+Total\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
      /\b(?:BPL|Repeater|CWSN|EWS)\b[^0-9]{0,200}?\bTotal\b\s*[:\-–.]?\s*(\d[\d,]*)/i,
    ],
  } as const;

  (Object.keys(patterns) as (keyof typeof patterns)[]).forEach((key) => {
    applyRegexBucketNumber(window, values, key, [...patterns[key]]);
    if (values[key] == null) applyRegexBucketNumber(blob, values, key, [...patterns[key]]);
  });

  const anchorLineIdx = lines.findIndex(
    (l) => OTHERS_SECTION_HEADER_RE.test(l) || OTHERS_BLOB_ANCHOR_RE.test(l),
  );
  if (anchorLineIdx >= 0) {
    sectionPresent = true;
    const end = Math.min(anchorLineIdx + 40, lines.length);
    for (let i = anchorLineIdx; i < end; i++) {
      const line = lines[i];
      if (!line) continue;
      const tail = line.match(
        /\b(BPL|Repeaters?|CWSN|EWS|Other\s+categories?|Total)\b\s*[:\-–.]?\s*(\d[\d,]*)\s*$/i,
      );
      if (tail) {
        const raw = tail[1].toLowerCase().replace(/\s+/g, "");
        const n = num(tail[2]);
        if (n == null) continue;
        if (raw === "bpl" && values.bpl == null) values.bpl = n;
        else if (raw.startsWith("repeater") && values.repeater == null) values.repeater = n;
        else if (raw === "cwsn" && values.cwsn == null) values.cwsn = n;
        else if (raw === "ews" && values.ews == null) values.ews = n;
        else if (raw.startsWith("other") && values.otherCategories == null) values.otherCategories = n;
        else if (raw === "total" && values.total == null) values.total = n;
      }
    }
  }

  /**
   * Section total: pdf-parse may merge lines, so match the last `Total : N` token between
   * "Other Enrolment" and "Teaching Staff" (not line-anchored).
   */
  if (values.total == null) {
    const start = text.search(/\bOther\s+Enrolment\b/i);
    if (start >= 0) {
      const endMark = text.search(/\bTeaching\s+Staff\b/i);
      const slice = endMark > start ? text.slice(start, endMark) : text.slice(start);
      const matches = [...slice.matchAll(/\bTotal\s*[:\s]+(\d[\d,]*)/gi)];
      if (matches.length > 0) {
        const n = num(matches[matches.length - 1][1]);
        if (n != null) values.total = n;
      }
    }
  }

  const filled = (Object.values(values) as (number | null)[]).filter((x) => x != null).length;
  let confidence = filled === 0 ? 0.02 : (filled / 6) * 0.48;
  if (filled >= 2) confidence += 0.1;
  if (sectionPresent && filled >= 1) confidence += 0.1;

  return {
    enrolmentOthers: values,
    enrolmentOthersConfidence: Math.min(0.9, confidence),
    sectionPresent,
  };
}

export function othersHasData(v: OthersValues): boolean {
  return (Object.values(v) as (number | null)[]).some((x) => x != null);
}
