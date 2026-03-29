import type { ReportCardNormalized, ReportCardParseResult } from "../report-card-normalized.js";
import { num, str } from "./text-helpers.js";

/** Academic year like 2024-25 or 2024-2025 when labeled in the report card. */
export function extractAcademicYearFromReportCard(text: string): string | null {
  const m =
    text.match(/\bAcademic\s*Year\s*[:\s]+(\d{4}\s*[-–]\s*\d{2,4})/i) ||
    text.match(/\bA\.?Y\.?\s*[:\s]+(\d{4}\s*[-–]\s*\d{2,4})/i) ||
    text.match(/\b(\d{4}\s*[-–]\s*\d{2,4})\s*(?:\(Current\))?\s*$/im);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, "").replace(/–/g, "-");
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
export function parseReportCardTextLegacy(text: string, fallbackUdise: string): ReportCardParseResult {
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
