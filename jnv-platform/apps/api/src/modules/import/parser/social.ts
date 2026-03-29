import type { ReportCardNormalized } from "../report-card-normalized.js";
import { applyRegexBucketNumber, num } from "./text-helpers.js";

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
    applyRegexBucketNumber(window, values, key, [...patterns[key]]);
    if (values[key] == null) applyRegexBucketNumber(blob, values, key, [...patterns[key]]);
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
