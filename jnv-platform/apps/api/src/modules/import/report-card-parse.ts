import { loadEnv } from "../../config/env.js";
import type { ReportCardParseResult } from "./report-card-normalized.js";
import { extractEnrolmentAgeFromReportCard, ageHasData } from "./parser/age.js";
import { extractDigitalFromReportCard, digitalHasData } from "./parser/digital.js";
import { extractInfraFromReportCard, infraHasData } from "./parser/infra.js";
import { extractEnrolmentMinorityFromReportCard, minorityHasData } from "./parser/minority.js";
import { extractEnrolmentOthersFromReportCard, othersHasData } from "./parser/others.js";
import {
  extractAcademicYearFromReportCard,
  extractStudentHeadcountFromReportCard,
  parseReportCardTextLegacy,
} from "./parser/profile.js";
import { extractEnrolmentSocialFromReportCard } from "./parser/social.js";
import { extractTeachersFromReportCard, teachersHasData } from "./parser/teachers.js";

/**
 * Section-based report-card parse: one extractor per enrolment / infra / digital / teachers block.
 * Set `REPORT_CARD_LEGACY_FULL_PARSE` to merge UDISE / school profile / students from the legacy parser.
 *
 * When a section header exists in the PDF but individual cells are missing, the section is still attached
 * with `null` buckets (unknown within section). Sections with no header and no signals are omitted.
 */
export function parseReportCardText(text: string, fallbackUdise: string): ReportCardParseResult {
  const env = loadEnv();
  const { enrolmentSocial, enrolmentSocialConfidence } = extractEnrolmentSocialFromReportCard(text);
  const { enrolmentMinority, enrolmentMinorityConfidence } = extractEnrolmentMinorityFromReportCard(text);
  const { enrolmentOthers, enrolmentOthersConfidence, sectionPresent: othersSectionPresent } =
    extractEnrolmentOthersFromReportCard(text);
  const { enrolmentAge, enrolmentAgeConfidence } = extractEnrolmentAgeFromReportCard(text);
  const { infra, infraConfidence } = extractInfraFromReportCard(text);
  const { digital, digitalConfidence, sectionPresent: digitalSectionPresent } =
    extractDigitalFromReportCard(text);
  const { teachers, teachersConfidence, sectionPresent: teachersSectionPresent } =
    extractTeachersFromReportCard(text);

  const academicYear = extractAcademicYearFromReportCard(text);

  const out: ReportCardParseResult = {
    enrolmentSocial,
    enrolmentSocialConfidence,
  };

  if (academicYear) {
    out.academicYear = academicYear;
  }

  if (minorityHasData(enrolmentMinority)) {
    out.enrolmentMinority = enrolmentMinority;
    out.enrolmentMinorityConfidence = enrolmentMinorityConfidence;
  }

  if (othersHasData(enrolmentOthers) || othersSectionPresent) {
    out.enrolmentOthers = enrolmentOthers;
    out.enrolmentOthersConfidence = enrolmentOthersConfidence;
  }

  if (ageHasData(enrolmentAge)) {
    out.enrolmentAge = enrolmentAge;
    out.enrolmentAgeConfidence = enrolmentAgeConfidence;
  }

  if (infraHasData(infra)) {
    out.infra = infra;
    out.infraConfidence = infraConfidence;
  }

  if (digitalHasData(digital) || digitalSectionPresent) {
    out.digital = digital;
    out.digitalConfidence = digitalConfidence;
  }

  if (teachersHasData(teachers) || teachersSectionPresent) {
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
    if (academicYear) out.academicYear = academicYear;
    if (minorityHasData(enrolmentMinority)) {
      out.enrolmentMinority = enrolmentMinority;
      out.enrolmentMinorityConfidence = enrolmentMinorityConfidence;
    }
    if (othersHasData(enrolmentOthers) || othersSectionPresent) {
      out.enrolmentOthers = enrolmentOthers;
      out.enrolmentOthersConfidence = enrolmentOthersConfidence;
    }
    if (ageHasData(enrolmentAge)) {
      out.enrolmentAge = enrolmentAge;
      out.enrolmentAgeConfidence = enrolmentAgeConfidence;
    }
    if (infraHasData(infra)) {
      out.infra = infra;
      out.infraConfidence = infraConfidence;
    }
    if (digitalHasData(digital) || digitalSectionPresent) {
      out.digital = digital;
      out.digitalConfidence = digitalConfidence;
    }
    if (teachersHasData(teachers) || teachersSectionPresent) {
      out.teachers = teachers;
      out.teachersConfidence = teachersConfidence;
    }
    if (headcount && (headcount.total > 0 || headcount.boys > 0 || headcount.girls > 0)) {
      out.students = headcount;
    }
  }

  return out;
}

/** Alias for callers that prefer `extractReportCard` naming. */
export function extractReportCard(pdfText: string, fallbackUdise: string): ReportCardParseResult {
  return parseReportCardText(pdfText, fallbackUdise);
}
