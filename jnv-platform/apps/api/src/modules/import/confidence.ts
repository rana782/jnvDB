import { loadEnv } from "../../config/env.js";
import type { ReportCardParseResult } from "./report-card-normalized.js";

/**
 * Aggregate confidence and human-readable warnings from section parse scores.
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
      confidence += normalized.enrolmentMinorityConfidence * 0.18;
    }
    if (normalized.enrolmentOthersConfidence != null) {
      confidence += normalized.enrolmentOthersConfidence * 0.12;
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

/** Per-section confidence when only that block is relevant (e.g. tests, debugging). */
export function calculateConfidenceForSection(score01: number | null | undefined): number {
  if (score01 == null || !Number.isFinite(score01)) return 0;
  return Math.max(0, Math.min(1, score01));
}
