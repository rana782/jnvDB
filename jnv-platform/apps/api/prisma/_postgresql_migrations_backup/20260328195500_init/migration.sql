-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ParsingStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('UNREVIEWED', 'IN_REVIEW', 'REVIEWED');

-- CreateEnum
CREATE TYPE "CompletionPipelineStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'CONTACTED', 'PILOT_READY', 'PILOT_RUNNING', 'DONE');

-- CreateEnum
CREATE TYPE "RevenueScenarioKind" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "RegionOffice" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegionOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "lgdCode" INTEGER,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "regionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "lgdCode" INTEGER,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderUser" (
    "id" TEXT NOT NULL,
    "rollcode" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FounderUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderUserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "FounderUserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "School" (
    "udise" VARCHAR(11) NOT NULL,
    "schoolName" TEXT NOT NULL,
    "managementName" TEXT,
    "categoryName" TEXT,
    "schoolType" TEXT,
    "classesFrom" INTEGER,
    "classesTo" INTEGER,
    "yearOfEstablishment" INTEGER,
    "residentialStatus" TEXT,
    "cbseAffiliationSec" TEXT,
    "cbseAffiliationHsec" TEXT,
    "ruralUrban" TEXT,
    "apiStateName" TEXT,
    "geographicState" TEXT,
    "geographicDistrict" TEXT,
    "blockName" TEXT,
    "villageName" TEXT,
    "clusterName" TEXT,
    "pincode" TEXT,
    "lgdBlockId" INTEGER,
    "lgdDistrictId" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "stateId" TEXT,
    "districtId" TEXT,
    "totalStudents" INTEGER,
    "totalBoys" INTEGER,
    "totalGirls" INTEGER,
    "totalTeachers" INTEGER,
    "waterAvailable" BOOLEAN,
    "electricityAvailable" BOOLEAN,
    "internetAvailable" BOOLEAN,
    "solarAvailable" BOOLEAN,
    "playgroundAvailable" BOOLEAN,
    "libraryAvailable" BOOLEAN,
    "hmEmail" TEXT,
    "hmMobile" TEXT,
    "pdfRelativePath" TEXT,
    "screenshotRelativePath" TEXT,
    "sourcePdfHash" TEXT,
    "extractorVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "parsingStatus" "ParsingStatus" NOT NULL DEFAULT 'PENDING',
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "pipelineStatus" "CompletionPipelineStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "profileCompletenessPct" DOUBLE PRECISION DEFAULT 0,
    "pilotSuitable" BOOLEAN DEFAULT false,
    "manualRevenueOccupancy" DOUBLE PRECISION,
    "manualWashPrice" DOUBLE PRECISION,
    "manualWashesPerStudentMonth" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("udise")
);

-- CreateTable
CREATE TABLE "SchoolProfile" (
    "udise" TEXT NOT NULL,
    "rawJson" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolProfile_pkey" PRIMARY KEY ("udise")
);

-- CreateTable
CREATE TABLE "SchoolInfra" (
    "udise" TEXT NOT NULL,
    "puccaBuilding" BOOLEAN,
    "functionalToiletsB" INTEGER,
    "functionalToiletsG" INTEGER,
    "rampsAvailable" BOOLEAN,
    "medicalCheckup" BOOLEAN,
    "extra" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolInfra_pkey" PRIMARY KEY ("udise")
);

-- CreateTable
CREATE TABLE "SchoolDigitalFacilities" (
    "udise" TEXT NOT NULL,
    "smartClassTv" INTEGER,
    "laptops" INTEGER,
    "desktops" INTEGER,
    "tablets" INTEGER,
    "printers" INTEGER,
    "extra" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDigitalFacilities_pkey" PRIMARY KEY ("udise")
);

-- CreateTable
CREATE TABLE "SchoolTeacherBreakdown" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolTeacherBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolEnrolmentSocial" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "boys" INTEGER,
    "girls" INTEGER,
    "total" INTEGER,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolEnrolmentSocial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolEnrolmentMinority" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "boys" INTEGER,
    "girls" INTEGER,
    "total" INTEGER,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolEnrolmentMinority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolEnrolmentOthers" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "boys" INTEGER,
    "girls" INTEGER,
    "total" INTEGER,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolEnrolmentOthers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolEnrolmentAge" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "ageBand" TEXT NOT NULL,
    "boys" INTEGER,
    "girls" INTEGER,
    "total" INTEGER,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolEnrolmentAge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolRevenueScenario" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "kind" "RevenueScenarioKind" NOT NULL DEFAULT 'CUSTOM',
    "label" TEXT,
    "inputs" JSONB NOT NULL,
    "monthlyRevenue" DOUBLE PRECISION,
    "annualRevenue" DOUBLE PRECISION,
    "revenueBoys" DOUBLE PRECISION,
    "revenueGirls" DOUBLE PRECISION,
    "revenueTotal" DOUBLE PRECISION,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolRevenueScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolProgress" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "fromStatus" "CompletionPipelineStatus",
    "toStatus" "CompletionPipelineStatus" NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolNote" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "waterReliability" TEXT,
    "electricityReliability" TEXT,
    "spaceAvailable" TEXT,
    "staffSupport" TEXT,
    "comments" TEXT,
    "followUpAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDocument" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExtractionRaw" (
    "id" TEXT NOT NULL,
    "udise" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "rawText" TEXT,
    "payload" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extractorVersion" TEXT NOT NULL,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolExtractionRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "processedFiles" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastProcessedUdise" TEXT,
    "forceReextract" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "udise" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'error',
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegionOffice_code_key" ON "RegionOffice"("code");

-- CreateIndex
CREATE UNIQUE INDEX "State_lgdCode_key" ON "State"("lgdCode");

-- CreateIndex
CREATE UNIQUE INDEX "State_normalizedName_key" ON "State"("normalizedName");

-- CreateIndex
CREATE INDEX "State_regionId_idx" ON "State"("regionId");

-- CreateIndex
CREATE INDEX "State_name_idx" ON "State"("name");

-- CreateIndex
CREATE INDEX "District_stateId_idx" ON "District"("stateId");

-- CreateIndex
CREATE INDEX "District_name_idx" ON "District"("name");

-- CreateIndex
CREATE UNIQUE INDEX "District_stateId_normalizedName_key" ON "District"("stateId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FounderUser_rollcode_key" ON "FounderUser"("rollcode");

-- CreateIndex
CREATE INDEX "School_stateId_idx" ON "School"("stateId");

-- CreateIndex
CREATE INDEX "School_districtId_idx" ON "School"("districtId");

-- CreateIndex
CREATE INDEX "School_geographicState_idx" ON "School"("geographicState");

-- CreateIndex
CREATE INDEX "School_geographicDistrict_idx" ON "School"("geographicDistrict");

-- CreateIndex
CREATE INDEX "School_parsingStatus_idx" ON "School"("parsingStatus");

-- CreateIndex
CREATE INDEX "School_pipelineStatus_idx" ON "School"("pipelineStatus");

-- CreateIndex
CREATE INDEX "School_totalStudents_idx" ON "School"("totalStudents");

-- CreateIndex
CREATE INDEX "School_updatedAt_idx" ON "School"("updatedAt");

-- CreateIndex
CREATE INDEX "SchoolTeacherBreakdown_udise_idx" ON "SchoolTeacherBreakdown"("udise");

-- CreateIndex
CREATE INDEX "SchoolEnrolmentSocial_udise_idx" ON "SchoolEnrolmentSocial"("udise");

-- CreateIndex
CREATE INDEX "SchoolEnrolmentMinority_udise_idx" ON "SchoolEnrolmentMinority"("udise");

-- CreateIndex
CREATE INDEX "SchoolEnrolmentOthers_udise_idx" ON "SchoolEnrolmentOthers"("udise");

-- CreateIndex
CREATE INDEX "SchoolEnrolmentAge_udise_idx" ON "SchoolEnrolmentAge"("udise");

-- CreateIndex
CREATE INDEX "SchoolRevenueScenario_udise_idx" ON "SchoolRevenueScenario"("udise");

-- CreateIndex
CREATE INDEX "SchoolProgress_udise_idx" ON "SchoolProgress"("udise");

-- CreateIndex
CREATE INDEX "SchoolNote_udise_idx" ON "SchoolNote"("udise");

-- CreateIndex
CREATE INDEX "SchoolDocument_udise_idx" ON "SchoolDocument"("udise");

-- CreateIndex
CREATE INDEX "SchoolExtractionRaw_udise_idx" ON "SchoolExtractionRaw"("udise");

-- CreateIndex
CREATE INDEX "ImportError_jobId_idx" ON "ImportError"("jobId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "State" ADD CONSTRAINT "State_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "RegionOffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderUserRole" ADD CONSTRAINT "FounderUserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "FounderUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderUserRole" ADD CONSTRAINT "FounderUserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolProfile" ADD CONSTRAINT "SchoolProfile_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolInfra" ADD CONSTRAINT "SchoolInfra_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDigitalFacilities" ADD CONSTRAINT "SchoolDigitalFacilities_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTeacherBreakdown" ADD CONSTRAINT "SchoolTeacherBreakdown_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrolmentSocial" ADD CONSTRAINT "SchoolEnrolmentSocial_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrolmentMinority" ADD CONSTRAINT "SchoolEnrolmentMinority_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrolmentOthers" ADD CONSTRAINT "SchoolEnrolmentOthers_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrolmentAge" ADD CONSTRAINT "SchoolEnrolmentAge_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolRevenueScenario" ADD CONSTRAINT "SchoolRevenueScenario_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolProgress" ADD CONSTRAINT "SchoolProgress_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolProgress" ADD CONSTRAINT "SchoolProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "FounderUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolNote" ADD CONSTRAINT "SchoolNote_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolNote" ADD CONSTRAINT "SchoolNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "FounderUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDocument" ADD CONSTRAINT "SchoolDocument_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExtractionRaw" ADD CONSTRAINT "SchoolExtractionRaw_udise_fkey" FOREIGN KEY ("udise") REFERENCES "School"("udise") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "FounderUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

