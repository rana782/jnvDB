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
  totalStudents: number | null;
  totalBoys: number | null;
  totalGirls: number | null;
  profileCompletenessPct: number | null;
  pipelineStatus: string;
  parsingStatus: string;
  regionCode: string | null;
  stateName: string | null;
  provenance: SchoolProvenance;
};

export type SchoolListResponse = {
  items: SchoolListItem[];
  total: number;
  page: number;
  pageSize: number;
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

/** GET /api/dashboard/deployment */
export type DeploymentPriorityBreakdown = {
  readiness: number;
  students: number;
  infra: number;
  digital: number;
};

export type DeploymentSchoolRow = {
  udise: string;
  schoolName: string;
  geographicState: string | null;
  geographicDistrict: string | null;
  regionCode: string | null;
  regionName: string | null;
  totalStudents: number | null;
  profileCompletenessPct: number | null;
  monthlyRevenue: number | null;
  pipelineStatus: string;
  parsingStatus: string;
  pilotSuitable: boolean | null;
  priorityScore: number;
  breakdown: DeploymentPriorityBreakdown;
};

export type DeploymentStateRevenueRow = {
  state: string;
  schoolCount: number;
  totalStudents: number;
  monthlyRevenueSum: number;
  avgReadiness: number | null;
};

export type DeploymentReadinessBucket = {
  label: string;
  count: number;
};

export type DeploymentNextTarget = {
  udise: string;
  schoolName: string;
  geographicState: string | null;
  priorityScore: number;
  pipelineStatus: string;
  profileCompletenessPct: number | null;
};

export type DeploymentStrategyResponse = {
  filters: {
    state?: string;
    regionId?: string;
    minReadiness?: number;
    maxReadiness?: number;
    minMonthlyRevenue?: number;
    maxMonthlyRevenue?: number;
  };
  progress: {
    filteredSchoolCount: number;
    parsingCompletePercent: number;
    pipelineDonePercent: number;
    pilotSchoolsCount: number;
    nextTargets: DeploymentNextTarget[];
  };
  priorityWeights: { readiness: number; students: number; infra: number; digital: number };
  topSchools: DeploymentSchoolRow[];
  stateRevenueSummary: DeploymentStateRevenueRow[];
  readinessDistribution: DeploymentReadinessBucket[];
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
