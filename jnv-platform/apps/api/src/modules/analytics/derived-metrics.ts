import type { School } from "@prisma/client";

/** Weights sum to 100 — each dimension is all-or-nothing when its criteria are met. */
export const PROFILE_COMPLETENESS_WEIGHTS = {
  social: 20,
  minority: 20,
  others: 15,
  age: 15,
  studentTotals: 10,
  infra: 10,
  digital: 10,
} as const;

export type EnrolmentCompletenessRow = {
  total: number | null;
  boys: number | null;
  girls: number | null;
};

export type ProfileCompletenessSnapshot = Pick<
  School,
  | "totalStudents"
  | "totalBoys"
  | "totalGirls"
  | "waterAvailable"
  | "electricityAvailable"
  | "internetAvailable"
  | "solarAvailable"
  | "playgroundAvailable"
  | "libraryAvailable"
> & {
  enrolmentSocial: EnrolmentCompletenessRow[];
  enrolmentMinority: EnrolmentCompletenessRow[];
  enrolmentOthers: EnrolmentCompletenessRow[];
  enrolmentAge: EnrolmentCompletenessRow[];
  infra: {
    puccaBuilding: boolean | null;
    functionalToiletsB: number | null;
    functionalToiletsG: number | null;
    rampsAvailable: boolean | null;
    medicalCheckup: boolean | null;
  } | null;
  digital: {
    smartClassTv: number | null;
    laptops: number | null;
    desktops: number | null;
    tablets: number | null;
    printers: number | null;
  } | null;
};

function enrolmentSectionHasData(rows: EnrolmentCompletenessRow[]): boolean {
  if (!rows.length) return false;
  return rows.some((r) => {
    const t = r.total;
    if (typeof t === "number" && Number.isFinite(t) && t > 0) return true;
    const b = typeof r.boys === "number" && Number.isFinite(r.boys) ? r.boys : 0;
    const g = typeof r.girls === "number" && Number.isFinite(r.girls) ? r.girls : 0;
    return b + g > 0;
  });
}

function studentTotalsComplete(s: Pick<School, "totalStudents" | "totalBoys" | "totalGirls">): boolean {
  const head = s.totalStudents;
  if (typeof head === "number" && Number.isFinite(head) && head > 0) return true;
  const b = s.totalBoys;
  const g = s.totalGirls;
  const sum = (typeof b === "number" && Number.isFinite(b) ? b : 0) + (typeof g === "number" && Number.isFinite(g) ? g : 0);
  return sum > 0;
}

function infraComplete(s: ProfileCompletenessSnapshot): boolean {
  const i = s.infra;
  if (i) {
    if (i.puccaBuilding != null) return true;
    if (i.functionalToiletsB != null && i.functionalToiletsB > 0) return true;
    if (i.functionalToiletsG != null && i.functionalToiletsG > 0) return true;
    if (i.rampsAvailable != null) return true;
    if (i.medicalCheckup != null) return true;
  }
  const flags = [
    s.waterAvailable,
    s.electricityAvailable,
    s.internetAvailable,
    s.solarAvailable,
    s.playgroundAvailable,
    s.libraryAvailable,
  ].filter((v) => v != null);
  return flags.length >= 2;
}

function digitalComplete(d: ProfileCompletenessSnapshot["digital"]): boolean {
  if (!d) return false;
  return [d.smartClassTv, d.laptops, d.desktops, d.tablets, d.printers].some((n) => n != null);
}

/**
 * Profile completeness 0–100 from persisted relations and core school fields.
 * Each weighted block counts fully when its data is present, otherwise 0.
 */
export function computeProfileCompletenessFromSnapshot(s: ProfileCompletenessSnapshot): number {
  let score = 0;
  const w = PROFILE_COMPLETENESS_WEIGHTS;
  if (enrolmentSectionHasData(s.enrolmentSocial)) score += w.social;
  if (enrolmentSectionHasData(s.enrolmentMinority)) score += w.minority;
  if (enrolmentSectionHasData(s.enrolmentOthers)) score += w.others;
  if (enrolmentSectionHasData(s.enrolmentAge)) score += w.age;
  if (studentTotalsComplete(s)) score += w.studentTotals;
  if (infraComplete(s)) score += w.infra;
  if (digitalComplete(s.digital)) score += w.digital;
  return Math.min(100, Math.round(score));
}

export function studentTeacherRatio(school: Pick<School, "totalStudents" | "totalTeachers">): number | null {
  const t = school.totalTeachers;
  const s = school.totalStudents;
  if (t == null || s == null || t === 0) return null;
  return Math.round((s / t) * 100) / 100;
}

/** @deprecated Prefer computeProfileCompletenessFromSnapshot with relations; kept for narrow tests. */
export function computeProfileCompleteness(school: School): number {
  return computeProfileCompletenessFromSnapshot({
    totalStudents: school.totalStudents,
    totalBoys: school.totalBoys,
    totalGirls: school.totalGirls,
    waterAvailable: school.waterAvailable,
    electricityAvailable: school.electricityAvailable,
    internetAvailable: school.internetAvailable,
    solarAvailable: school.solarAvailable,
    playgroundAvailable: school.playgroundAvailable,
    libraryAvailable: school.libraryAvailable,
    enrolmentSocial: [],
    enrolmentMinority: [],
    enrolmentOthers: [],
    enrolmentAge: [],
    infra: null,
    digital: null,
  });
}

export function computePilotSuitable(school: School, completeness: number): boolean {
  const hasStudents = (school.totalStudents ?? 0) > 0 || (school.totalBoys ?? 0) + (school.totalGirls ?? 0) > 0;
  const hasElectric = school.electricityAvailable === true;
  const hasWater = school.waterAvailable === true;
  return completeness >= 50 && hasStudents && hasElectric && hasWater;
}
