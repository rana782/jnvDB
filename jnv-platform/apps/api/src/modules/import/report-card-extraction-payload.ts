import type { ReportCardParseResult } from "./report-card-normalized.js";
import { REPORT_CARD_PARSER_VERSION } from "./parser/constants.js";

/** Stored in `SchoolReportCardSnapshot.payload` (JSON). */
export type ReportCardSnapshotPayload = {
  schemaVersion: 2;
  structured: ReportCardParseResult;
  provenance: {
    academicYear: string | null;
    sourcePdfHash: string;
    pdfRelativePath: string;
    extractedAt: string;
    parserVersion: string;
    extractorVersion: string;
    charCount: number;
    pages: number;
    usedOcr: boolean;
  };
  /** 0–1 scores aligned with `structured` section confidences. */
  confidenceBySection: {
    enrolmentSocial?: number;
    enrolmentMinority?: number;
    enrolmentOthers?: number;
    enrolmentAge?: number;
    infra?: number;
    digital?: number;
    teachers?: number;
  };
  /**
   * Best-effort location hints (single flattened text; per-page offsets need a page-aware extractor).
   * `lineIndex` is 0-based in `text.split(/\r?\n/)`.
   */
  sectionProvenance: Record<
    string,
    { lineIndex: number | null; charOffset: number | null; page: number | null }
  >;
};

function lineIndexOf(text: string, re: RegExp): number | null {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => re.test(l.trim()));
  return idx >= 0 ? idx : null;
}

function charOffsetForLine(text: string, lineIndex: number | null): number | null {
  if (lineIndex == null || lineIndex < 0) return null;
  const lines = text.split(/\r?\n/);
  let off = 0;
  for (let i = 0; i < lineIndex && i < lines.length; i++) {
    off += lines[i].length + 1;
  }
  return off;
}

/**
 * Build canonical snapshot JSON: full structured parse + hashes, timestamps, parser version, section hints.
 */
export function buildReportCardSnapshotPayload(args: {
  text: string;
  structured: ReportCardParseResult;
  sourcePdfHash: string;
  pdfRelativePath: string;
  extractorVersion: string;
  extraction: { charCount: number; pages: number; usedOcr: boolean };
  extractedAt?: Date;
}): ReportCardSnapshotPayload {
  const { text, structured, sourcePdfHash, pdfRelativePath, extractorVersion, extraction } = args;
  const at = args.extractedAt ?? new Date();

  const sectionRes: ReportCardSnapshotPayload["sectionProvenance"] = {
    enrolmentSocial: (() => {
      const li = lineIndexOf(text, /social\s*category|category[\s\-]*wise/i);
      return { lineIndex: li, charOffset: charOffsetForLine(text, li), page: null };
    })(),
    enrolmentMinority: (() => {
      const li = lineIndexOf(text, /religious\s*minority|minority\s*community/i);
      return { lineIndex: li, charOffset: charOffsetForLine(text, li), page: null };
    })(),
    enrolmentOthers: (() => {
      const li = lineIndexOf(text, /other\s+enrolment|bpl\b|repeater\b|cwsn\b/i);
      return { lineIndex: li, charOffset: charOffsetForLine(text, li), page: null };
    })(),
    enrolmentAge: (() => {
      const li = lineIndexOf(text, /age[\s\-]*wise|age\s*distribution/i);
      return { lineIndex: li, charOffset: charOffsetForLine(text, li), page: null };
    })(),
    infra: (() => {
      const li = lineIndexOf(text, /basic\s*facilities|school\s*facilities|infrastructure/i);
      return { lineIndex: li, charOffset: charOffsetForLine(text, li), page: null };
    })(),
    digital: (() => {
      const li = lineIndexOf(text, /ICT|digital\s*facilities|computer\s*facility/i);
      return { lineIndex: li, charOffset: charOffsetForLine(text, li), page: null };
    })(),
    teachers: (() => {
      const li = lineIndexOf(text, /teaching\s*staff|staff\s*details/i);
      return { lineIndex: li, charOffset: charOffsetForLine(text, li), page: null };
    })(),
  };

  return {
    schemaVersion: 2,
    structured: { ...structured },
    provenance: {
      academicYear: structured.academicYear ?? null,
      sourcePdfHash,
      pdfRelativePath,
      extractedAt: at.toISOString(),
      parserVersion: REPORT_CARD_PARSER_VERSION,
      extractorVersion,
      charCount: extraction.charCount,
      pages: extraction.pages,
      usedOcr: extraction.usedOcr,
    },
    confidenceBySection: {
      enrolmentSocial: structured.enrolmentSocialConfidence,
      enrolmentMinority: structured.enrolmentMinorityConfidence,
      enrolmentOthers: structured.enrolmentOthersConfidence,
      enrolmentAge: structured.enrolmentAgeConfidence,
      infra: structured.infraConfidence,
      digital: structured.digitalConfidence,
      teachers: structured.teachersConfidence,
    },
    sectionProvenance: sectionRes,
  };
}
