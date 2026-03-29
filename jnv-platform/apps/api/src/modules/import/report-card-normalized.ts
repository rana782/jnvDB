/**
 * Strict normalized contract aligned with DB-facing sections:
 * - School scalars (name, geography, headcount)
 * - SchoolEnrolmentSocial — row `category`: SC, ST, OBC, General, Total
 * - SchoolEnrolmentMinority — row `category`: Muslim, Christian, Sikh, Buddhist, Jain, Others, Total
 * - SchoolEnrolmentOthers — row `category`: CWSN, EWS, Other categories, Total
 * - SchoolEnrolmentAge — row `ageBand`: 10–18 as digits, plus Total
 * - Infra availability flags (maps to School facility booleans when ingested)
 * - Digital asset counts (maps toward `SchoolDigitalFacilities` when ingested)
 * - Teacher headcounts / training split (maps toward `SchoolTeacherBreakdown` or scalars when ingested)
 *
 * Parsers return only `Partial<ReportCardNormalized>` — complete nested objects when a section key is present.
 */

/** Missing buckets are null (not coerced to 0). */
export type ReportCardEnrolmentSocial = {
  sc: number | null;
  st: number | null;
  obc: number | null;
  general: number | null;
  total: number | null;
};

/** Maps to `SchoolEnrolmentMinority.category` (totals-only extraction; boys/girls left to DB as null until split is parsed). */
export type ReportCardEnrolmentMinority = {
  muslim: number | null;
  christian: number | null;
  sikh: number | null;
  buddhist: number | null;
  jain: number | null;
  others: number | null;
  total: number | null;
};

/** Maps to `SchoolEnrolmentOthers.category`. */
export type ReportCardEnrolmentOthers = {
  cwsn: number | null;
  ews: number | null;
  bpl: number | null;
  repeater: number | null;
  otherCategories: number | null;
  total: number | null;
};

/** Maps to `SchoolEnrolmentAge.ageBand` ("10".."18", "Total"). */
export type ReportCardEnrolmentAge = {
  age_10: number | null;
  age_11: number | null;
  age_12: number | null;
  age_13: number | null;
  age_14: number | null;
  age_15: number | null;
  age_16: number | null;
  age_17: number | null;
  age_18: number | null;
  total: number | null;
};

/** Facility availability from the report card; `null` = unknown / not extracted. */
export type ReportCardInfra = {
  electricity: boolean | null;
  water: boolean | null;
  internet: boolean | null;
  solar: boolean | null;
  playground: boolean | null;
  library: boolean | null;
};

/** ICT / digital inventory counts; `null` = unknown / not extracted. */
export type ReportCardDigital = {
  desktops: number | null;
  laptops: number | null;
  tablets: number | null;
  printers: number | null;
  projectors: number | null;
  /** Maps to `SchoolDigitalFacilities.smartClassTv`. */
  smartClassTv: number | null;
};

/** Teaching staff summary; `null` = unknown / not extracted. */
export type ReportCardTeachers = {
  total: number | null;
  male: number | null;
  female: number | null;
  trained: number | null;
  untrained: number | null;
};

export interface ReportCardNormalized {
  udise: string;
  schoolProfile: {
    name: string;
    state: string;
    district: string;
  };
  students: {
    total: number;
    boys: number;
    girls: number;
  };
  enrolmentSocial: ReportCardEnrolmentSocial;
  enrolmentMinority: ReportCardEnrolmentMinority;
  enrolmentOthers: ReportCardEnrolmentOthers;
  enrolmentAge: ReportCardEnrolmentAge;
  infra: ReportCardInfra;
  digital: ReportCardDigital;
  teachers: ReportCardTeachers;
}

/** Parser output: normalized sections plus optional per-section scores (not flattened). */
export type ReportCardParseResult = Partial<ReportCardNormalized> & {
  /** Academic year string when present in the PDF (e.g. 2024-25). */
  academicYear?: string | null;
  /** 0–1 confidence for `enrolmentSocial` */
  enrolmentSocialConfidence?: number;
  /** 0–1 confidence for `enrolmentMinority` (populate when parser supports this section) */
  enrolmentMinorityConfidence?: number;
  /** 0–1 confidence for `enrolmentOthers` */
  enrolmentOthersConfidence?: number;
  /** 0–1 confidence for `enrolmentAge` */
  enrolmentAgeConfidence?: number;
  /** 0–1 confidence for `infra` */
  infraConfidence?: number;
  /** 0–1 confidence for `digital` */
  digitalConfidence?: number;
  /** 0–1 confidence for `teachers` */
  teachersConfidence?: number;
};

/** DB `SchoolEnrolmentMinority.category` labels aligned with `ReportCardEnrolmentMinority` keys. */
export const ENROLMENT_MINORITY_CATEGORY: Record<keyof ReportCardEnrolmentMinority, string> = {
  muslim: "Muslim",
  christian: "Christian",
  sikh: "Sikh",
  buddhist: "Buddhist",
  jain: "Jain",
  others: "Others",
  total: "Total",
};

/** DB `SchoolEnrolmentOthers.category` labels aligned with `ReportCardEnrolmentOthers` keys. */
export const ENROLMENT_OTHERS_CATEGORY: Record<keyof ReportCardEnrolmentOthers, string> = {
  cwsn: "CWSN",
  ews: "EWS",
  bpl: "BPL",
  repeater: "Repeater",
  otherCategories: "Other categories",
  total: "Total",
};

/** DB `SchoolEnrolmentAge.ageBand` aligned with `ReportCardEnrolmentAge` keys. */
export const ENROLMENT_AGE_BAND: Record<keyof ReportCardEnrolmentAge, string> = {
  age_10: "10",
  age_11: "11",
  age_12: "12",
  age_13: "13",
  age_14: "14",
  age_15: "15",
  age_16: "16",
  age_17: "17",
  age_18: "18",
  total: "Total",
};
