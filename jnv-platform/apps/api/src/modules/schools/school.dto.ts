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
  revenueScenarios: true,
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
  revenueScenarios: { where: { kind: "CUSTOM" as const }, take: 1 },
} satisfies Prisma.SchoolInclude;

export type SchoolListRow = Prisma.SchoolGetPayload<{ include: typeof schoolListInclude }>;

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
  totalStudents: number | null;
  totalBoys: number | null;
  totalGirls: number | null;
  profileCompletenessPct: number | null;
  pipelineStatus: string;
  parsingStatus: string;
  regionCode: string | null;
  stateName: string | null;
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
    digital: SchoolDetailRow["digital"];
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

export function toSchoolListItem(s: SchoolListRow): SchoolListItemDto {
  return {
    udise: s.udise,
    schoolName: s.schoolName,
    geographicState: s.geographicState ?? null,
    geographicDistrict: s.geographicDistrict ?? null,
    totalStudents: s.totalStudents ?? null,
    totalBoys: s.totalBoys ?? null,
    totalGirls: s.totalGirls ?? null,
    profileCompletenessPct: s.profileCompletenessPct ?? null,
    pipelineStatus: s.pipelineStatus,
    parsingStatus: s.parsingStatus,
    regionCode: s.state?.region?.code ?? null,
    stateName: s.state?.name ?? null,
    provenance: baseProvenance(s),
  };
}

export function toSchoolCanonical(s: SchoolDetailRow): SchoolCanonicalDto {
  const snap = s.reportCardSnapshot;
  return {
    udise: s.udise,
    profile: {
      schoolName: s.schoolName,
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
      geographicState: s.geographicState ?? null,
      geographicDistrict: s.geographicDistrict ?? null,
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
      waterAvailable: s.waterAvailable ?? null,
      electricityAvailable: s.electricityAvailable ?? null,
      internetAvailable: s.internetAvailable ?? null,
      solarAvailable: s.solarAvailable ?? null,
      playgroundAvailable: s.playgroundAvailable ?? null,
      libraryAvailable: s.libraryAvailable ?? null,
    },
    contact: { hmEmail: s.hmEmail ?? null, hmMobile: s.hmMobile ?? null },
    provenance: {
      ...baseProvenance(s),
      extractorVersion: s.extractorVersion,
      reportSnapshot: snap
        ? { extractedAt: snap.extractedAt.toISOString(), payload: snap.payload }
        : null,
    },
    sections: {
      infra: s.infra,
      digital: s.digital,
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
  const {
    enrolmentSocial: _cSoc,
    enrolmentMinority: _cMin,
    enrolmentOthers: _cOth,
    enrolmentAge: _cAge,
    ...chartSeries
  } = canonical.chartSeries;
  const {
    enrolmentSocial: _sSoc,
    enrolmentMinority: _sMin,
    enrolmentOthers: _sOth,
    enrolmentAge: _sAge,
    ...sections
  } = canonical.sections;
  return {
    school: { ...canonical, sections, chartSeries },
    enrolmentSocial: toCategoryChartRows(s.enrolmentSocial),
    enrolmentMinority: toCategoryChartRows(s.enrolmentMinority),
    enrolmentOthers: toCategoryChartRows(s.enrolmentOthers),
    enrolmentAge: toAgeChartRows(s.enrolmentAge),
    extractionConfidence: s.overallExtractionConfidence ?? null,
    pdfPath: s.pdfRelativePath ?? null,
  };
}
