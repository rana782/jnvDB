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

export type DashboardSummary = {
  totalSchools: number;
  totalStudents: number;
  totalBoys: number;
  totalGirls: number;
  schoolsCompleted: number;
  portfolioMonthlyRevenue: number;
  portfolioAnnualRevenue: number;
};

export type DashboardProgress = {
  totalSchools: number;
  pipeline: Record<string, number>;
  parsing: Record<string, number>;
  schoolsPipelineDone: number;
  pipelineDonePercent: number;
};

export type MapAggState = { name: string; schoolCount: number; studentSum: number };
export type MapAggRegion = { name: string; schoolCount: number };
export type MapAgg = { states: MapAggState[]; regions: MapAggRegion[]; totalSchools: number };
