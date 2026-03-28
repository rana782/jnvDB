import type { School } from "@prisma/client";

const WEIGHTS = {
  identity: 15,
  location: 15,
  students: 20,
  teachers: 10,
  infra: 20,
  digital: 10,
  pdf: 10,
} as const;

export function studentTeacherRatio(school: Pick<School, "totalStudents" | "totalTeachers">): number | null {
  const t = school.totalTeachers;
  const s = school.totalStudents;
  if (t == null || s == null || t === 0) return null;
  return Math.round((s / t) * 100) / 100;
}

export function computeProfileCompleteness(school: School): number {
  let score = 0;
  if (school.schoolName?.length) score += WEIGHTS.identity;
  if (school.geographicState || school.apiStateName) score += WEIGHTS.location * 0.5;
  if (school.geographicDistrict) score += WEIGHTS.location * 0.5;
  if (school.totalStudents != null && school.totalStudents > 0) score += WEIGHTS.students;
  else if (school.totalBoys != null || school.totalGirls != null) score += WEIGHTS.students * 0.5;
  if (school.totalTeachers != null) score += WEIGHTS.teachers;
  const infraFields = [
    school.waterAvailable,
    school.electricityAvailable,
    school.internetAvailable,
  ].filter((v) => v != null).length;
  score += (WEIGHTS.infra * infraFields) / 3;
  if (school.pdfRelativePath) score += WEIGHTS.pdf;
  return Math.min(100, Math.round(score));
}

export function computePilotSuitable(school: School, completeness: number): boolean {
  const hasStudents = (school.totalStudents ?? 0) > 0 || (school.totalBoys ?? 0) + (school.totalGirls ?? 0) > 0;
  const hasElectric = school.electricityAvailable === true;
  const hasWater = school.waterAvailable === true;
  return completeness >= 50 && hasStudents && hasElectric && hasWater;
}
