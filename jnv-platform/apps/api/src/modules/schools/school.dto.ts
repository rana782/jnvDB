import type { Prisma } from "@prisma/client";

export const schoolDetailInclude = {
  state: { include: { region: true } },
  district: true,
  infra: true,
  digital: true,
  teachers: true,
  enrolmentSocial: true,
  enrolmentMinority: true,
  enrolmentOthers: true,
  enrolmentAge: true,
  revenueScenarios: { orderBy: { computedAt: "desc" as const } },
  rawExtractions: { orderBy: { createdAt: "desc" as const }, take: 5 },
  notes: { orderBy: { updatedAt: "desc" as const } },
  progressEvents: { orderBy: { createdAt: "desc" as const }, take: 20 },
  documents: true,
  reportCardSnapshot: true,
} satisfies Prisma.SchoolInclude;

export type SchoolDetailRow = Prisma.SchoolGetPayload<{ include: typeof schoolDetailInclude }>;

export const schoolListInclude = {
  state: { include: { region: true } },
  district: true,
  revenueScenarios: {
    where: { kind: { in: ["LOW", "MEDIUM", "HIGH"] as const } },
    orderBy: { computedAt: "desc" as const },
    select: { kind: true, monthlyRevenue: true, annualRevenue: true },
  },
} satisfies Prisma.SchoolInclude;

export type SchoolListRow = Prisma.SchoolGetPayload<{ include: typeof schoolListInclude }>;

/** Compare view: same facts as detail for charts/sections, without notes, documents, raw extractions, or snapshot. */
export const schoolCompareInclude = {
  state: { include: { region: true } },
  district: true,
  infra: true,
  digital: true,
  teachers: true,
  enrolmentSocial: true,
  enrolmentMinority: true,
  enrolmentOthers: true,
  enrolmentAge: true,
  revenueScenarios: { orderBy: { computedAt: "desc" as const } },
  progressEvents: { orderBy: { createdAt: "desc" as const }, take: 20 },
} satisfies Prisma.SchoolInclude;

export type SchoolCompareRow = Prisma.SchoolGetPayload<{ include: typeof schoolCompareInclude }>;

/** Adapt compare query rows to the detail shape expected by `toSchoolCanonical`. */
export function compareRowAsDetailRowForCanonical(s: SchoolCompareRow): SchoolDetailRow {
  return {
    ...s,
    rawExtractions: [],
    notes: [],
    documents: [],
    reportCardSnapshot: null,
  } as SchoolDetailRow;
}

export type SchoolProvenanceDto = {
  academicYear: string | null;
  sourcePdfHash: string | null;
  pdfRelativePath: string | null;
  screenshotRelativePath: string | null;
  overallExtractionConfidence: number | null;
  lastPdfExtractedAt: string | null;
  importLastError: string | null;
  parsingStatus: string;
};

export type SchoolListItemDto = {
  udise: string;
  schoolName: string;
  geographicState: string | null;
  geographicDistrict: string | null;
  latitude: number | null;
  longitude: number | null;
  totalStudents: number | null;
  totalBoys: number | null;
  totalGirls: number | null;
  profileCompletenessPct: number | null;
  pipelineStatus: string;
  parsingStatus: string;
  regionCode: string | null;
  regionName: string | null;
  stateName: string | null;
  revenueByScenario: {
    low: { monthly: number | null; annual: number | null };
    medium: { monthly: number | null; annual: number | null };
    high: { monthly: number | null; annual: number | null };
  };
  provenance: SchoolProvenanceDto;
};

export type SchoolCanonicalDto = {
  udise: string;
  profile: {
    schoolName: string;
    managementName: string | null;
    categoryName: string | null;
    schoolType: string | null;
    classesFrom: number | null;
    classesTo: number | null;
    residentialStatus: string | null;
    yearOfEstablishment: number | null;
    ruralUrban: string | null;
    cbseAffiliationSec: string | null;
    cbseAffiliationHsec: string | null;
  };
  location: {
    apiStateName: string | null;
    geographicState: string | null;
    geographicDistrict: string | null;
    blockName: string | null;
    villageName: string | null;
    clusterName: string | null;
    pincode: string | null;
    latitude: number | null;
    longitude: number | null;
    region: { code: string; name: string } | null;
    districtLgd: number | null;
  };
  enrolmentHeadcount: {
    totalStudents: number | null;
    totalBoys: number | null;
    totalGirls: number | null;
    totalTeachers: number | null;
  };
  facilities: {
    waterAvailable: boolean | null;
    electricityAvailable: boolean | null;
    internetAvailable: boolean | null;
    solarAvailable: boolean | null;
    playgroundAvailable: boolean | null;
    libraryAvailable: boolean | null;
  };
  contact: { hmEmail: string | null; hmMobile: string | null };
  provenance: SchoolProvenanceDto & {
    extractorVersion: string;
    reportSnapshot: {
      extractedAt: string;
      payload: unknown;
    } | null;
  };
  sections: {
    infra: SchoolDetailRow["infra"];
    /** Flattened from `SchoolDigitalFacilities`; `projectors` read from `extra.projectors` when present. */
    digital: {
      smartClassTv: number | null;
      laptops: number | null;
      desktops: number | null;
      tablets: number | null;
      printers: number | null;
      projectors: number | null;
    } | null;
    teachers: SchoolDetailRow["teachers"];
    enrolmentSocial: SchoolDetailRow["enrolmentSocial"];
    enrolmentMinority: SchoolDetailRow["enrolmentMinority"];
    enrolmentOthers: SchoolDetailRow["enrolmentOthers"];
    enrolmentAge: SchoolDetailRow["enrolmentAge"];
  };
  chartSeries: {
    enrolmentSocial: { category: string; boys: number | null; girls: number | null; total: number | null }[];
    enrolmentMinority: { category: string; boys: number | null; girls: number | null; total: number | null }[];
    enrolmentOthers: { category: string; boys: number | null; girls: number | null; total: number | null }[];
    enrolmentAge: { ageBand: string; boys: number | null; girls: number | null; total: number | null }[];
    teachers: { category: string; label: string; count: number }[];
  };
  revenueScenarios: SchoolDetailRow["revenueScenarios"];
  progressEvents: SchoolDetailRow["progressEvents"];
  notes: SchoolDetailRow["notes"];
  documents: SchoolDetailRow["documents"];
  rawExtractions: SchoolDetailRow["rawExtractions"];
  profileCompletenessPct: number | null;
  pilotSuitable: boolean | null;
  pipelineStatus: string;
  reviewStatus: string;
  manualRevenue: {
    manualRevenueOccupancy: number | null;
    manualWashPrice: number | null;
    manualWashesPerStudentMonth: number | null;
  };
};

/** Numeric total for bar charts: `total` when set, otherwise boys + girls (never null — use 0). */
function chartValueFromRow(
  total: number | null | undefined,
  boys: number | null | undefined,
  girls: number | null | undefined,
): number {
  if (typeof total === "number" && Number.isFinite(total)) return total;
  const b = typeof boys === "number" && Number.isFinite(boys) ? boys : 0;
  const g = typeof girls === "number" && Number.isFinite(girls) ? girls : 0;
  return b + g;
}

/** Category-based enrolment rows formatted for charts (DB → API). */
export type EnrolmentCategoryChartDto = {
  category: string;
  boys: number | null;
  girls: number | null;
  total: number | null;
  chartValue: number;
};

export type EnrolmentAgeChartDto = {
  ageBand: string;
  boys: number | null;
  girls: number | null;
  total: number | null;
  chartValue: number;
};

function toCategoryChartRows(
  rows: { category: string; boys: number | null; girls: number | null; total: number | null }[],
): EnrolmentCategoryChartDto[] {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((r) => ({
    category: r.category ?? "",
    boys: r.boys ?? null,
    girls: r.girls ?? null,
    total: r.total ?? null,
    chartValue: chartValueFromRow(r.total, r.boys, r.girls),
  }));
}

function toAgeChartRows(
  rows: { ageBand: string; boys: number | null; girls: number | null; total: number | null }[],
): EnrolmentAgeChartDto[] {
  const list = Array.isArray(rows) ? rows : [];
  const mapped = list.map((r) => ({
    ageBand: r.ageBand ?? "",
    boys: r.boys ?? null,
    girls: r.girls ?? null,
    total: r.total ?? null,
    chartValue: chartValueFromRow(r.total, r.boys, r.girls),
  }));
  return mapped.sort((a, b) => {
    if (a.ageBand === "Total") return 1;
    if (b.ageBand === "Total") return -1;
    return (parseInt(a.ageBand, 10) || 0) - (parseInt(b.ageBand, 10) || 0);
  });
}

/** `payload` from SchoolReportCardSnapshot (crawler / PDF import). */
function structuredFromSnapshotPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  const st = p.structured;
  if (st && typeof st === "object" && !Array.isArray(st)) return st as Record<string, unknown>;
  return null;
}

function coerceFiniteInt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").trim();
    if (!t) return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mergeBool(db: boolean | null | undefined, snap: unknown): boolean | null {
  if (db === true || db === false) return db;
  if (snap === true) return true;
  if (snap === false) return false;
  return db ?? null;
}

function infraRecord(st: Record<string, unknown> | null): Record<string, unknown> | null {
  const i = st?.infra;
  return i && typeof i === "object" && !Array.isArray(i) ? (i as Record<string, unknown>) : null;
}

type SlimCat = { category: string; boys: number | null; girls: number | null; total: number | null };

function nonTotalPositiveCategoryCount(rows: SlimCat[]): number {
  let n = 0;
  for (const r of rows) {
    if (String(r.category ?? "").trim().toLowerCase() === "total") continue;
    if (chartValueFromRow(r.total, r.boys, r.girls) > 0) n++;
  }
  return n;
}

function categoryRowsFromSocialBlock(block: unknown): SlimCat[] {
  if (!block || typeof block !== "object") return [];
  const b = block as Record<string, unknown>;
  const pairs: [string, string][] = [
    ["sc", "SC"],
    ["st", "ST"],
    ["obc", "OBC"],
    ["general", "General"],
    ["total", "Total"],
  ];
  const out: SlimCat[] = [];
  for (const [key, label] of pairs) {
    const n = coerceFiniteInt(b[key]);
    if (n != null) out.push({ category: label, boys: null, girls: null, total: n });
  }
  return out;
}

function categoryRowsFromMinorityBlock(block: unknown): SlimCat[] {
  if (!block || typeof block !== "object") return [];
  const b = block as Record<string, unknown>;
  const pairs: [string, string][] = [
    ["muslim", "Muslim"],
    ["christian", "Christian"],
    ["sikh", "Sikh"],
    ["buddhist", "Buddhist"],
    ["jain", "Jain"],
    ["others", "Other"],
    ["total", "Total"],
  ];
  const out: SlimCat[] = [];
  for (const [key, label] of pairs) {
    const n = coerceFiniteInt(b[key]);
    if (n != null) out.push({ category: label, boys: null, girls: null, total: n });
  }
  return out;
}

function categoryRowsFromOthersBlock(block: unknown): SlimCat[] {
  if (!block || typeof block !== "object") return [];
  const b = block as Record<string, unknown>;
  const pairs: [string, string][] = [
    ["cwsn", "CWSN"],
    ["ews", "EWS"],
    ["bpl", "BPL"],
    ["repeater", "Repeater"],
    ["otherCategories", "Other categories"],
    ["total", "Total"],
  ];
  const out: SlimCat[] = [];
  for (const [key, label] of pairs) {
    const n = coerceFiniteInt(b[key]);
    if (n != null) out.push({ category: label, boys: null, girls: null, total: n });
  }
  return out;
}

type SlimAge = { ageBand: string; boys: number | null; girls: number | null; total: number | null };

function ageHasBandDetail(rows: SlimAge[]): boolean {
  for (const r of rows) {
    const band = String(r.ageBand ?? "").trim();
    if (band.toLowerCase() === "total") continue;
    if (/^\d{1,2}$/.test(band) && chartValueFromRow(r.total, r.boys, r.girls) > 0) return true;
  }
  return false;
}

function ageRowsFromStructuredBlock(block: unknown): SlimAge[] {
  if (!block || typeof block !== "object") return [];
  const b = block as Record<string, unknown>;
  const out: SlimAge[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (!k.startsWith("age_")) continue;
    const suffix = k.slice(4);
    const n = coerceFiniteInt(v);
    if (n != null) out.push({ ageBand: suffix, boys: null, girls: null, total: n });
  }
  const tot = coerceFiniteInt(b.total);
  if (tot != null) out.push({ ageBand: "Total", boys: null, girls: null, total: tot });
  return out;
}

function mergeSocialForCharts(db: SchoolDetailRow["enrolmentSocial"], payload: unknown): SlimCat[] {
  const slim: SlimCat[] = db.map((r) => ({
    category: r.category,
    boys: r.boys ?? null,
    girls: r.girls ?? null,
    total: r.total ?? null,
  }));
  if (nonTotalPositiveCategoryCount(slim) >= 1) return slim;
  const st = structuredFromSnapshotPayload(payload);
  const syn = categoryRowsFromSocialBlock(st?.enrolmentSocial);
  return syn.length > 0 ? syn : slim;
}

function mergeMinorityForCharts(db: SchoolDetailRow["enrolmentMinority"], payload: unknown): SlimCat[] {
  const slim: SlimCat[] = db.map((r) => ({
    category: r.category,
    boys: r.boys ?? null,
    girls: r.girls ?? null,
    total: r.total ?? null,
  }));
  if (nonTotalPositiveCategoryCount(slim) >= 1) return slim;
  const st = structuredFromSnapshotPayload(payload);
  const syn = categoryRowsFromMinorityBlock(st?.enrolmentMinority);
  return syn.length > 0 ? syn : slim;
}

function mergeOthersForCharts(db: SchoolDetailRow["enrolmentOthers"], payload: unknown): SlimCat[] {
  const slim: SlimCat[] = db.map((r) => ({
    category: r.category,
    boys: r.boys ?? null,
    girls: r.girls ?? null,
    total: r.total ?? null,
  }));
  if (nonTotalPositiveCategoryCount(slim) >= 1) return slim;
  const st = structuredFromSnapshotPayload(payload);
  const syn = categoryRowsFromOthersBlock(st?.enrolmentOthers);
  return syn.length > 0 ? syn : slim;
}

function mergeAgeForCharts(db: SchoolDetailRow["enrolmentAge"], payload: unknown): SlimAge[] {
  const slim: SlimAge[] = db.map((r) => ({
    ageBand: r.ageBand,
    boys: r.boys ?? null,
    girls: r.girls ?? null,
    total: r.total ?? null,
  }));
  if (ageHasBandDetail(slim)) return slim;
  const st = structuredFromSnapshotPayload(payload);
  const syn = ageRowsFromStructuredBlock(st?.enrolmentAge);
  return syn.length > 0 ? syn : slim;
}

/**
 * `school` mirrors canonical detail but omits enrolment breakdowns provided at the top level.
 */
export type SchoolDetailApiSchoolDto = Omit<SchoolCanonicalDto, "sections" | "chartSeries"> & {
  sections: Omit<
    SchoolCanonicalDto["sections"],
    "enrolmentSocial" | "enrolmentMinority" | "enrolmentOthers" | "enrolmentAge"
  >;
  chartSeries: Omit<
    SchoolCanonicalDto["chartSeries"],
    "enrolmentSocial" | "enrolmentMinority" | "enrolmentOthers" | "enrolmentAge"
  >;
};

/**
 * GET /api/schools/:udise — single contract for the school detail page (nested school + flat enrolment arrays + meta).
 * Progress lives on `school.progressEvents`; revenue on `school.revenueScenarios`; completeness on `school.profileCompletenessPct`.
 */
export type SchoolDetailApiResponse = {
  school: SchoolDetailApiSchoolDto;
  enrolmentSocial: EnrolmentCategoryChartDto[];
  enrolmentMinority: EnrolmentCategoryChartDto[];
  enrolmentOthers: EnrolmentCategoryChartDto[];
  enrolmentAge: EnrolmentAgeChartDto[];
  extractionConfidence: number | null;
  pdfPath: string | null;
};

function baseProvenance(s: SchoolDetailRow | SchoolListRow): SchoolProvenanceDto {
  return {
    academicYear: s.academicYear ?? null,
    sourcePdfHash: s.sourcePdfHash ?? null,
    pdfRelativePath: s.pdfRelativePath ?? null,
    screenshotRelativePath: s.screenshotRelativePath ?? null,
    overallExtractionConfidence: s.overallExtractionConfidence ?? null,
    lastPdfExtractedAt: s.lastPdfExtractedAt?.toISOString() ?? null,
    importLastError: s.importLastError ?? null,
    parsingStatus: s.parsingStatus,
  };
}

const REGION_NAME_RE =
  /\b(bhopal|patna|lucknow|jaipur|chandigarh|shillong|hyderabad|pune)\b/i;

function normSpaces(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

function projectorsFromDigitalExtra(extra: unknown): number | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const p = (extra as Record<string, unknown>).projectors;
  if (typeof p === "number" && Number.isFinite(p)) return p;
  if (typeof p === "string") {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickDigitalCount(
  d: SchoolDetailRow["digital"] | null,
  block: Record<string, unknown> | null,
  rowKey: "smartClassTv" | "laptops" | "desktops" | "tablets" | "printers",
  structKey: string,
): number | null {
  const rv = d?.[rowKey];
  if (rv != null && typeof rv === "number" && Number.isFinite(rv)) return rv;
  const n = coerceFiniteInt(block?.[structKey]);
  if (n != null) return n;
  return null;
}

/** API-facing digital block (no raw `extra`); fills from snapshot `structured.digital` when columns are null. */
export function digitalSectionForApi(
  d: SchoolDetailRow["digital"],
  structuredDigital?: unknown,
): SchoolCanonicalDto["sections"]["digital"] {
  const block =
    structuredDigital && typeof structuredDigital === "object" && !Array.isArray(structuredDigital)
      ? (structuredDigital as Record<string, unknown>)
      : null;
  const smartClassTv = pickDigitalCount(d, block, "smartClassTv", "smartClassTv");
  const laptops = pickDigitalCount(d, block, "laptops", "laptops");
  const desktops = pickDigitalCount(d, block, "desktops", "desktops");
  const tablets = pickDigitalCount(d, block, "tablets", "tablets");
  const printers = pickDigitalCount(d, block, "printers", "printers");
  const projectors =
    projectorsFromDigitalExtra(d?.extra ?? null) ?? coerceFiniteInt(block?.projectors) ?? null;
  const nums = [smartClassTv, laptops, desktops, tablets, printers, projectors];
  if (!d && !block && nums.every((x) => x == null)) return null;
  return {
    smartClassTv,
    laptops,
    desktops,
    tablets,
    printers,
    projectors,
  };
}

function districtFromSchoolName(name: string | null | undefined): string | null {
  const n = normSpaces(name);
  if (!n) return null;
  const m = n.match(/jawahar\s+navodaya\s+vidyalaya\s+(.+)$/i);
  if (!m?.[1]) return null;
  const parts = normSpaces(m[1])
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? first;
  const picked = REGION_NAME_RE.test(first) && parts.length >= 2 ? last : first;
  if (!picked || picked.length < 2 || /^\d{11}$/.test(picked)) return null;
  return picked;
}

function sanitizeDistrict(
  rawDistrict: string | null | undefined,
  districtRelName: string | null | undefined,
  schoolName: string | null | undefined,
): string | null {
  const raw = normSpaces(rawDistrict);
  const rel = normSpaces(districtRelName);
  const isBad = (v: string) =>
    !v ||
    /^\d{11}$/.test(v) ||
    /region|office|social|category|cluster|pincode|block|rural|urban|state/i.test(v) ||
    REGION_NAME_RE.test(v);
  if (raw && !isBad(raw)) return raw;
  if (rel && !isBad(rel)) return rel;
  return districtFromSchoolName(schoolName);
}

function sanitizeSchoolName(rawName: string | null | undefined, cleanedDistrict: string | null): string {
  const raw = normSpaces(rawName);
  if (!raw && cleanedDistrict) return `Jawahar Navodaya Vidyalaya ${cleanedDistrict}`;
  if (!raw) return "Jawahar Navodaya Vidyalaya";

  const isJnv = /^jawahar\s+navodaya\s+vidyalaya\b/i.test(raw);
  if (!isJnv && cleanedDistrict) return `Jawahar Navodaya Vidyalaya ${cleanedDistrict}`;
  if (!cleanedDistrict) return raw;

  const tail = raw.replace(/^jawahar\s+navodaya\s+vidyalaya\b\s*/i, "").trim();
  const tailIsBad =
    !tail ||
    tail.length < 3 ||
    REGION_NAME_RE.test(tail) ||
    /\bregion|office|social|category|cluster|pincode|block|rural|urban\b/i.test(tail);
  if (tailIsBad) return `Jawahar Navodaya Vidyalaya ${cleanedDistrict}`;
  return raw;
}

export function toSchoolListItem(s: SchoolListRow): SchoolListItemDto {
  const cleanedDistrict = sanitizeDistrict(s.geographicDistrict, s.district?.name ?? null, s.schoolName);
  const cleanedSchoolName = sanitizeSchoolName(s.schoolName, cleanedDistrict);
  const latestByKind = new Map<string, { monthlyRevenue: number | null; annualRevenue: number | null }>();
  for (const r of s.revenueScenarios ?? []) {
    const k = String(r.kind ?? "");
    if (!latestByKind.has(k)) {
      latestByKind.set(k, { monthlyRevenue: r.monthlyRevenue ?? null, annualRevenue: r.annualRevenue ?? null });
    }
  }
  return {
    udise: s.udise,
    schoolName: cleanedSchoolName,
    geographicState: s.geographicState ?? s.state?.name ?? s.apiStateName ?? "Unknown",
    geographicDistrict: cleanedDistrict,
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
    totalStudents: s.totalStudents ?? null,
    totalBoys: s.totalBoys ?? null,
    totalGirls: s.totalGirls ?? null,
    profileCompletenessPct: s.profileCompletenessPct ?? null,
    pipelineStatus: s.pipelineStatus,
    parsingStatus: s.parsingStatus,
    regionCode: s.state?.region?.code ?? null,
    regionName: s.state?.region?.name ?? null,
    stateName: s.state?.name ?? null,
    revenueByScenario: {
      low: {
        monthly: latestByKind.get("LOW")?.monthlyRevenue ?? null,
        annual: latestByKind.get("LOW")?.annualRevenue ?? null,
      },
      medium: {
        monthly: latestByKind.get("MEDIUM")?.monthlyRevenue ?? null,
        annual: latestByKind.get("MEDIUM")?.annualRevenue ?? null,
      },
      high: {
        monthly: latestByKind.get("HIGH")?.monthlyRevenue ?? null,
        annual: latestByKind.get("HIGH")?.annualRevenue ?? null,
      },
    },
    provenance: baseProvenance(s),
  };
}

export function toSchoolCanonical(s: SchoolDetailRow): SchoolCanonicalDto {
  const snap = s.reportCardSnapshot;
  const structured = structuredFromSnapshotPayload(snap?.payload);
  const infra = infraRecord(structured);
  const cleanedDistrict = sanitizeDistrict(s.geographicDistrict, s.district?.name ?? null, s.schoolName);
  const cleanedSchoolName = sanitizeSchoolName(s.schoolName, cleanedDistrict);
  return {
    udise: s.udise,
    profile: {
      schoolName: cleanedSchoolName,
      managementName: s.managementName ?? null,
      categoryName: s.categoryName ?? null,
      schoolType: s.schoolType ?? null,
      classesFrom: s.classesFrom ?? null,
      classesTo: s.classesTo ?? null,
      residentialStatus: s.residentialStatus ?? null,
      yearOfEstablishment: s.yearOfEstablishment ?? null,
      ruralUrban: s.ruralUrban ?? null,
      cbseAffiliationSec: s.cbseAffiliationSec ?? null,
      cbseAffiliationHsec: s.cbseAffiliationHsec ?? null,
    },
    location: {
      apiStateName: s.apiStateName ?? null,
      /** Match list view: bulk Excel often leaves geographicState empty but stateId + State row exist. */
      geographicState:
        normSpaces(s.geographicState) ||
        normSpaces(s.state?.name) ||
        normSpaces(s.apiStateName) ||
        null,
      geographicDistrict: cleanedDistrict,
      blockName: s.blockName ?? null,
      villageName: s.villageName ?? null,
      clusterName: s.clusterName ?? null,
      pincode: s.pincode ?? null,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      region: s.state?.region ? { code: s.state.region.code, name: s.state.region.name } : null,
      districtLgd: s.lgdDistrictId ?? null,
    },
    enrolmentHeadcount: {
      totalStudents: s.totalStudents ?? null,
      totalBoys: s.totalBoys ?? null,
      totalGirls: s.totalGirls ?? null,
      totalTeachers: s.totalTeachers ?? null,
    },
    facilities: {
      waterAvailable: mergeBool(s.waterAvailable, infra?.water),
      electricityAvailable: mergeBool(s.electricityAvailable, infra?.electricity),
      internetAvailable: mergeBool(s.internetAvailable, infra?.internet),
      solarAvailable: mergeBool(s.solarAvailable, infra?.solar),
      playgroundAvailable: mergeBool(s.playgroundAvailable, infra?.playground),
      libraryAvailable: mergeBool(s.libraryAvailable, infra?.library),
    },
    contact: { hmEmail: s.hmEmail ?? null, hmMobile: s.hmMobile ?? null },
    provenance: {
      ...baseProvenance(s),
      extractorVersion: s.extractorVersion ?? "1.0.0",
      reportSnapshot: snap
        ? { extractedAt: snap.extractedAt.toISOString(), payload: snap.payload }
        : null,
    },
    sections: {
      infra: s.infra,
      digital: digitalSectionForApi(s.digital, structured?.digital),
      teachers: s.teachers,
      enrolmentSocial: s.enrolmentSocial,
      enrolmentMinority: s.enrolmentMinority,
      enrolmentOthers: s.enrolmentOthers,
      enrolmentAge: s.enrolmentAge,
    },
    chartSeries: {
      enrolmentSocial: s.enrolmentSocial.map((r) => ({
        category: r.category,
        boys: r.boys ?? null,
        girls: r.girls ?? null,
        total: r.total ?? null,
      })),
      enrolmentMinority: s.enrolmentMinority.map((r) => ({
        category: r.category,
        boys: r.boys ?? null,
        girls: r.girls ?? null,
        total: r.total ?? null,
      })),
      enrolmentOthers: s.enrolmentOthers.map((r) => ({
        category: r.category,
        boys: r.boys ?? null,
        girls: r.girls ?? null,
        total: r.total ?? null,
      })),
      enrolmentAge: s.enrolmentAge.map((r) => ({
        ageBand: r.ageBand,
        boys: r.boys ?? null,
        girls: r.girls ?? null,
        total: r.total ?? null,
      })),
      teachers: s.teachers.map((t) => ({ category: t.category, label: t.label, count: t.count })),
    },
    revenueScenarios: s.revenueScenarios,
    progressEvents: s.progressEvents,
    notes: s.notes,
    documents: s.documents,
    rawExtractions: s.rawExtractions,
    profileCompletenessPct: s.profileCompletenessPct ?? null,
    pilotSuitable: s.pilotSuitable ?? null,
    pipelineStatus: s.pipelineStatus,
    reviewStatus: s.reviewStatus,
    manualRevenue: {
      manualRevenueOccupancy: s.manualRevenueOccupancy ?? null,
      manualWashPrice: s.manualWashPrice ?? null,
      manualWashesPerStudentMonth: s.manualWashesPerStudentMonth ?? null,
    },
  };
}

/** GET /api/schools/:udise — all fields from DB via `getSchoolDetailRow`; no re-parsing. */
export function toSchoolDetailApiResponse(s: SchoolDetailRow): SchoolDetailApiResponse {
  const canonical = toSchoolCanonical(s);
  const chartSeries = { teachers: canonical.chartSeries.teachers };
  const sections = {
    infra: canonical.sections.infra,
    digital: canonical.sections.digital,
    teachers: canonical.sections.teachers,
  };
  const snapPayload = s.reportCardSnapshot?.payload;
  return {
    school: { ...canonical, sections, chartSeries },
    enrolmentSocial: toCategoryChartRows(mergeSocialForCharts(s.enrolmentSocial, snapPayload)),
    enrolmentMinority: toCategoryChartRows(mergeMinorityForCharts(s.enrolmentMinority, snapPayload)),
    enrolmentOthers: toCategoryChartRows(mergeOthersForCharts(s.enrolmentOthers, snapPayload)),
    enrolmentAge: toAgeChartRows(mergeAgeForCharts(s.enrolmentAge, snapPayload)),
    extractionConfidence: s.overallExtractionConfidence ?? null,
    pdfPath: s.pdfRelativePath ?? null,
  };
}
