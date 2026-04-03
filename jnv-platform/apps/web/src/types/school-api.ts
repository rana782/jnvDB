/** Mirrors API list/detail DTOs (subset used by the web app). */

export type SchoolProvenance = {
  academicYear: string | null;
  sourcePdfHash: string | null;
  pdfRelativePath: string | null;
  screenshotRelativePath: string | null;
  overallExtractionConfidence: number | null;
  lastPdfExtractedAt: string | null;
  importLastError: string | null;
  parsingStatus: string;
};

export type SchoolListItem = {
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
  provenance: SchoolProvenance;
};

export type SchoolListResponse = {
  items: SchoolListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type SchoolInfraInsights = {
  totalSchools: number;
  facilities: {
    key: "water" | "electricity" | "internet" | "solar" | "playground" | "library";
    label: string;
    available: number;
    missing: number;
    pctAvailable: number;
  }[];
  coverageBuckets: { label: string; count: number }[];
  digitalAccess: {
    key: "smartClassTv" | "desktops" | "laptops" | "tablets";
    label: string;
    count: number;
    pct: number;
  }[];
};

export type EnrolmentChartRow = {
  category: string;
  boys: number | null;
  girls: number | null;
  total: number | null;
};

/** GET /api/schools/:udise — category enrolment rows with a safe chart magnitude. */
export type EnrolmentCategoryChartRow = EnrolmentChartRow & {
  chartValue: number;
};

export type EnrolmentAgeChartRow = {
  ageBand: string;
  boys: number | null;
  girls: number | null;
  total: number | null;
  chartValue: number;
};

export type SchoolCanonical = {
  udise: string;
  profile: { schoolName: string };
  location: { geographicState: string | null; geographicDistrict: string | null };
  enrolmentHeadcount: {
    totalStudents: number | null;
    totalBoys: number | null;
    totalGirls: number | null;
    totalTeachers: number | null;
  };
  facilities: Record<string, boolean | null>;
  provenance: SchoolProvenance & {
    extractorVersion: string;
    reportSnapshot: { extractedAt: string; payload: unknown } | null;
  };
  chartSeries: {
    enrolmentSocial: EnrolmentChartRow[];
    enrolmentMinority: EnrolmentChartRow[];
    enrolmentOthers: EnrolmentChartRow[];
    enrolmentAge: { ageBand: string; boys: number | null; girls: number | null; total: number | null }[];
    teachers: { category: string; label: string; count: number }[];
  };
  sections: {
    infra?: {
      puccaBuilding?: boolean | null;
      functionalToiletsB?: number | null;
      functionalToiletsG?: number | null;
      rampsAvailable?: boolean | null;
      medicalCheckup?: boolean | null;
    } | null;
    digital?: {
      smartClassTv?: number | null;
      laptops?: number | null;
      desktops?: number | null;
      tablets?: number | null;
      printers?: number | null;
      projectors?: number | null;
    } | null;
    teachers?: { category?: string | null; label?: string | null; count?: number | null }[] | null;
    enrolmentSocial?: unknown[] | null;
    enrolmentMinority?: unknown[] | null;
    enrolmentOthers?: unknown[] | null;
    enrolmentAge?: unknown[] | null;
  };
  pipelineStatus: string;
  parsingStatus?: string;
  profileCompletenessPct: number | null;
  pilotSuitable: boolean | null;
  progressEvents: { toStatus: string; createdAt: string; note?: string | null }[];
  revenueScenarios: unknown[];
  manualRevenue: {
    manualRevenueOccupancy: number | null;
    manualWashPrice: number | null;
    manualWashesPerStudentMonth: number | null;
  };
};

/** Infra / digital detail rows on compare canonical (`sections` from API). */
export type SchoolInfraCompare = {
  puccaBuilding?: boolean | null;
  functionalToiletsB?: number | null;
  functionalToiletsG?: number | null;
  rampsAvailable?: boolean | null;
  medicalCheckup?: boolean | null;
} | null;

export type SchoolDigitalCompare = {
  smartClassTv?: number | null;
  laptops?: number | null;
  desktops?: number | null;
  tablets?: number | null;
  printers?: number | null;
  projectors?: number | null;
} | null;

export type SchoolRevenueScenarioCompare = {
  kind: string;
  monthlyRevenue?: number | null;
  annualRevenue?: number | null;
};

/** GET /api/schools/compare — canonical school DTOs including `sections` and typed revenue rows. */
export type CompareSchoolRow = Omit<SchoolCanonical, "revenueScenarios"> & {
  reviewStatus?: string;
  sections?: {
    infra?: SchoolInfraCompare;
    digital?: SchoolDigitalCompare;
  };
  revenueScenarios: SchoolRevenueScenarioCompare[];
};

export type CompareSchoolsResponse = {
  schools: CompareSchoolRow[];
};

/** Nested `school` from GET /api/schools/:udise (enrolment breakdowns are top-level arrays). */
export type SchoolDetailSchool = Omit<SchoolCanonical, "chartSeries"> & {
  chartSeries: Omit<
    SchoolCanonical["chartSeries"],
    "enrolmentSocial" | "enrolmentMinority" | "enrolmentOthers" | "enrolmentAge"
  >;
};

/** GET /api/schools/:udise */
export type SchoolDetailResponse = {
  school: SchoolDetailSchool;
  enrolmentSocial: EnrolmentCategoryChartRow[];
  enrolmentMinority: EnrolmentCategoryChartRow[];
  enrolmentOthers: EnrolmentCategoryChartRow[];
  enrolmentAge: EnrolmentAgeChartRow[];
  extractionConfidence: number | null;
  pdfPath: string | null;
};

export type DashboardSummary = {
  totalSchools: number;
  totalStudents: number;
  totalBoys: number;
  totalGirls: number;
  schoolsCompleted: number;
  portfolioMonthlyRevenue: number;
  portfolioAnnualRevenue: number;
  /** Count of schools with `totalStudents` populated (enrolment extracted into DB). */
  schoolsWithStudentHeadcount: number;
  /** Count of schools linked to seeded `State` → NVS region (reference geography). */
  schoolsLinkedToNvsRegion: number;
};

export type DashboardStateOpportunity = {
  state: string;
  schoolCount: number;
  totalStudents: number;
  monthlyRevenueSum: number;
};

export type DashboardRegionReadiness = {
  regionCode: string;
  regionName: string;
  schoolCount: number;
  avgReadiness: number | null;
};

export type DashboardStateRegionMapRow = {
  state: string;
  regionCode: string;
  regionName: string;
};

export type DashboardChartStateRow = {
  name: string;
  schools: number;
  students: number;
};

export type DashboardChartBucket = {
  label: string;
  count: number;
};

/** GET /api/dashboard/overview */
export type DashboardOverview = DashboardSummary & {
  topStatesByOpportunity: DashboardStateOpportunity[];
  topRegionsByReadiness: DashboardRegionReadiness[];
  stateRegionMap: DashboardStateRegionMapRow[];
  charts: {
    stateDistribution: DashboardChartStateRow[];
    revenueDistribution: DashboardChartBucket[];
    readinessDistribution: DashboardChartBucket[];
  };
};

export type DashboardProgress = {
  totalSchools: number;
  pipeline: Record<string, number>;
  parsing: Record<string, number>;
  schoolsPipelineDone: number;
  /** Percent of schools with pipeline status DONE (same as `completedPercent`). */
  pipelineDonePercent: number;
  /** Percent of schools marked DONE (pipeline complete). */
  completedPercent: number;
  /** Sum of stored CUSTOM scenario monthly revenue for schools in DONE. */
  completedRevenueMonthly: number;
  /** Sum of stored CUSTOM scenario annual revenue for schools in DONE. */
  completedRevenueAnnual: number;
};

export type MapAggMeta = {
  totalSchools: number;
  maxStateSchoolCount: number;
  maxStateAvgReadiness: number;
  colorBy: "jnv_count" | "readiness";
  minReadinessApplied: number | null;
  minStudentsApplied: number | null;
};

export type MapAggState = {
  name: string;
  schoolCount: number;
  studentSum: number;
  districtCount: number;
  avgReadiness: number | null;
  completedCount: number;
  /** Sum of per-school LOW scenario monthly revenue in this state (₹). */
  revenueLowMonthlySum?: number;
  revenueMediumMonthlySum?: number;
  revenueHighMonthlySum?: number;
};

export type MapAggRegion = {
  name: string;
  schoolCount: number;
  studentSum: number;
  avgReadiness: number | null;
};

export type MapAgg = {
  meta: MapAggMeta;
  states: MapAggState[];
  regions: MapAggRegion[];
};

export type MapDistrictRow = {
  name: string;
  schoolCount: number;
  studentSum: number;
  avgReadiness: number | null;
  completedCount: number;
};

export type MapDistrictResponse = {
  state: string;
  meta: {
    totalSchools: number;
    maxDistrictSchoolCount: number;
    maxDistrictAvgReadiness: number;
  };
  districts: MapDistrictRow[];
};

/** POST /api/revenue/projection — dynamic portfolio from enrolment + model inputs. */
export type RevenueProjectionModel = {
  pricePerWash: number;
  washesPerStudentPerMonth: number;
  adoptionRate: number;
  preset: "LOW" | "MEDIUM" | "HIGH" | null;
  presetOverrides?: {
    LOW?: { pricePerWash?: number; washesPerStudentPerMonth?: number; adoptionRate?: number };
    MEDIUM?: { pricePerWash?: number; washesPerStudentPerMonth?: number; adoptionRate?: number };
    HIGH?: { pricePerWash?: number; washesPerStudentPerMonth?: number; adoptionRate?: number };
  };
};

export type RevenueProjectionPortfolio = {
  schoolCount: number;
  totalStudents: number;
  totalBoys: number;
  totalGirls: number;
  monthlyRevenue: number;
  annualRevenue: number;
};

export type RevenueProjectionStateRow = {
  state: string;
  schoolCount: number;
  totalStudents: number;
  boys: number;
  girls: number;
  monthlyRevenue: number;
  annualRevenue: number;
};

export type RevenueProjectionSchoolRow = {
  udise: string;
  schoolName: string;
  state: string;
  totalStudents: number;
  boys: number;
  girls: number;
  monthlyRevenue: number;
  annualRevenue: number;
  revenueBoys: number;
  revenueGirls: number;
};

export type RevenueProjectionResponse = {
  model: RevenueProjectionModel;
  portfolio: RevenueProjectionPortfolio;
  byState: RevenueProjectionStateRow[];
  schools: RevenueProjectionSchoolRow[];
  schoolsTotal: number;
  schoolsPage: number;
  schoolsPageSize: number;
};

/** POST /api/revenue/calculate & scenario rows */
export type RevenueScenarioBreakdown = {
  monthlyRevenue: number;
  annualRevenue: number;
  revenueBoys: number;
  revenueGirls: number;
  revenueTotal: number;
  effectiveStudents: number;
  boysCount: number;
  girlsCount: number;
};
