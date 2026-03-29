import type { ReportCardNormalized } from "../report-card-normalized.js";
import { firstIntInPatterns, num } from "./text-helpers.js";

type TeachersValues = ReportCardNormalized["teachers"];

function emptyTeachers(): TeachersValues {
  return {
    total: null,
    male: null,
    female: null,
    trained: null,
    untrained: null,
  };
}

const TEACHER_SECTION_RE =
  /teaching\s*staff|staff\s*details|personnel|human\s*resources|no\.?\s*of\s*teachers/i;

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
  sectionPresent: boolean;
} {
  const values = emptyTeachers();
  const blob = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { window, anchored } = teacherSectionWindow(blob);
  const sectionPresent =
    anchored ||
    lines.some((l) => /^Teaching\s+Staff\s*$/i.test(l) || /^Staff\s+Details\s*$/i.test(l));

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

  const anchorIdx = lines.findIndex(
    (l) => TEACHER_SECTION_RE.test(l) || /^Teaching\s+Staff\s*$/i.test(l),
  );
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

  return { teachers: values, teachersConfidence: Math.min(0.9, confidence), sectionPresent };
}

export function teachersHasData(v: TeachersValues): boolean {
  return (Object.values(v) as (number | null)[]).some((x) => x != null);
}
