import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ScrapedDataPaths } from "../../config/paths.js";
import { toRepoRelative } from "../../config/paths.js";
import { getPrisma } from "../../shared/prisma.js";
import { normalizeUdise } from "../../shared/udise.js";
import {
  ageHasData,
  digitalHasData,
  extractPdfText,
  infraHasData,
  minorityHasData,
  othersHasData,
  parseReportCardText,
  reportCardExtractionMeta,
  teachersHasData,
} from "./pdf-extract.js";
import { buildReportCardSnapshotPayload } from "./report-card-extraction-payload.js";
import { REPORT_CARD_PARSER_VERSION } from "./parser/constants.js";
import type { ReportCardNormalized } from "./report-card-normalized.js";
import {
  ENROLMENT_AGE_BAND,
  ENROLMENT_MINORITY_CATEGORY,
  ENROLMENT_OTHERS_CATEGORY,
} from "./report-card-normalized.js";
import { computePilotSuitable, type ProfileCompletenessSnapshot } from "../analytics/derived-metrics.js";
import { calculateCompletenessFromSnapshot } from "./completeness.js";
import { calculateRevenue, scenarioPresets } from "../analytics/revenue-calculator.js";
import { logger } from "../../shared/logger.js";
import type { ImportJobStatus, Prisma } from "@prisma/client";
import { refreshMapAggregates } from "../map/map-rollup.service.js";

export type SchoolsJsonRow = {
  udise_code: string;
  school_name?: string;
  state?: string;
  district?: string;
  address?: string;
  internet_availability?: string;
  electricity_availability?: string;
  pdf_path?: string;
  screenshot_path?: string;
  arcgis_state_label?: string;
  lgd_district_id?: number;
  latitude?: number;
  longitude?: number;
  hm_email?: string;
  hm_mobile?: string;
};

/** Rows for `createMany` — one row per category with a non-null total (no duplicates). */
function buildEnrolmentSocialCreateManyData(
  udise: string,
  social: ReportCardNormalized["enrolmentSocial"],
): Prisma.SchoolEnrolmentSocialCreateManyInput[] {
  const pairs: [string, number | null][] = [
    ["SC", social.sc],
    ["ST", social.st],
    ["OBC", social.obc],
    ["General", social.general],
    ["Total", social.total],
  ];
  return pairs
    .filter(([, total]) => total != null)
    .map(([category, total]) => ({
      udise,
      category,
      total: total as number,
      boys: null,
      girls: null,
    }));
}

function buildEnrolmentMinorityCreateManyData(
  udise: string,
  section: ReportCardNormalized["enrolmentMinority"],
): Prisma.SchoolEnrolmentMinorityCreateManyInput[] {
  const rows: Prisma.SchoolEnrolmentMinorityCreateManyInput[] = [];
  for (const key of Object.keys(ENROLMENT_MINORITY_CATEGORY) as (keyof typeof ENROLMENT_MINORITY_CATEGORY)[]) {
    const total = section[key];
    if (total != null) {
      rows.push({
        udise,
        category: ENROLMENT_MINORITY_CATEGORY[key],
        total,
        boys: null,
        girls: null,
      });
    }
  }
  return rows;
}

function buildEnrolmentOthersCreateManyData(
  udise: string,
  section: ReportCardNormalized["enrolmentOthers"],
): Prisma.SchoolEnrolmentOthersCreateManyInput[] {
  const rows: Prisma.SchoolEnrolmentOthersCreateManyInput[] = [];
  for (const key of Object.keys(ENROLMENT_OTHERS_CATEGORY) as (keyof typeof ENROLMENT_OTHERS_CATEGORY)[]) {
    const total = section[key];
    if (total != null) {
      rows.push({
        udise,
        category: ENROLMENT_OTHERS_CATEGORY[key],
        total,
        boys: null,
        girls: null,
      });
    }
  }
  return rows;
}

function buildEnrolmentAgeCreateManyData(
  udise: string,
  section: ReportCardNormalized["enrolmentAge"],
): Prisma.SchoolEnrolmentAgeCreateManyInput[] {
  const rows: Prisma.SchoolEnrolmentAgeCreateManyInput[] = [];
  for (const key of Object.keys(ENROLMENT_AGE_BAND) as (keyof typeof ENROLMENT_AGE_BAND)[]) {
    const total = section[key];
    if (total != null) {
      rows.push({
        udise,
        ageBand: ENROLMENT_AGE_BAND[key],
        total,
        boys: null,
        girls: null,
      });
    }
  }
  return rows;
}

const REPORT_CARD_TEACHER_CATEGORY = "report_card";

type SchoolFacilityScalarPatch = Partial<{
  electricityAvailable: boolean | null;
  waterAvailable: boolean | null;
  internetAvailable: boolean | null;
  solarAvailable: boolean | null;
  playgroundAvailable: boolean | null;
  libraryAvailable: boolean | null;
}>;

/**
 * Map parsed infra → `School` facility booleans (filters, pilot suitability, deployment readiness).
 * Only keys with non-null parsed values are set so we do not erase prior data for missing slots.
 */
function schoolFacilityScalarsFromInfra(infra: ReportCardNormalized["infra"]): SchoolFacilityScalarPatch {
  const o: SchoolFacilityScalarPatch = {};
  if (infra.electricity !== null) o.electricityAvailable = infra.electricity;
  if (infra.water !== null) o.waterAvailable = infra.water;
  if (infra.internet !== null) o.internetAvailable = infra.internet;
  if (infra.solar !== null) o.solarAvailable = infra.solar;
  if (infra.playground !== null) o.playgroundAvailable = infra.playground;
  if (infra.library !== null) o.libraryAvailable = infra.library;
  return o;
}

function buildSchoolInfraCreateData(
  udise: string,
  infra: ReportCardNormalized["infra"],
): Prisma.SchoolInfraUncheckedCreateInput {
  return {
    udise,
    extra: {
      source: "report_card_pdf",
      availability: {
        electricity: infra.electricity,
        water: infra.water,
        internet: infra.internet,
        solar: infra.solar,
        playground: infra.playground,
        library: infra.library,
      },
    } as Prisma.InputJsonValue,
  };
}

function buildSchoolDigitalCreateData(
  udise: string,
  digital: ReportCardNormalized["digital"],
): Prisma.SchoolDigitalFacilitiesUncheckedCreateInput {
  return {
    udise,
    desktops: digital.desktops,
    laptops: digital.laptops,
    tablets: digital.tablets,
    printers: digital.printers,
    smartClassTv: digital.smartClassTv ?? null,
    ...(digital.projectors != null
      ? { extra: { projectors: digital.projectors } as Prisma.InputJsonValue }
      : {}),
  };
}

function buildTeacherBreakdownCreateManyData(
  udise: string,
  teachers: ReportCardNormalized["teachers"],
): Prisma.SchoolTeacherBreakdownCreateManyInput[] {
  const pairs: [string, number | null][] = [
    ["Total", teachers.total],
    ["Male", teachers.male],
    ["Female", teachers.female],
    ["Trained", teachers.trained],
    ["Untrained", teachers.untrained],
  ];
  return pairs
    .filter(([, count]) => count != null)
    .map(([label, count]) => ({
      udise,
      category: REPORT_CARD_TEACHER_CATEGORY,
      label,
      count: count as number,
    }));
}

function buildRevenueScenarioRows(
  udise: string,
  revBase: { totalStudents: number; boys?: number; girls?: number },
): Prisma.SchoolRevenueScenarioCreateManyInput[] {
  const rows: Prisma.SchoolRevenueScenarioCreateManyInput[] = [];
  for (const kind of ["LOW", "MEDIUM", "HIGH"] as const) {
    const r = scenarioPresets(kind, revBase);
    rows.push({
      udise,
      kind,
      label: kind,
      inputs: revBase as object,
      monthlyRevenue: r.monthlyRevenue,
      annualRevenue: r.annualRevenue,
      revenueBoys: r.revenueBoys,
      revenueGirls: r.revenueGirls,
      revenueTotal: r.revenueTotal,
    });
  }
  const custom = calculateRevenue({
    ...revBase,
    pricePerWash: 30,
    adoptionRate: 0.85,
    washesPerStudentPerMonth: 4,
  });
  rows.push({
    udise,
    kind: "CUSTOM",
    label: "default",
    inputs: { pricePerWash: 30, adoptionRate: 0.85, washesPerStudentPerMonth: 4 } as object,
    monthlyRevenue: custom.monthlyRevenue,
    annualRevenue: custom.annualRevenue,
    revenueBoys: custom.revenueBoys,
    revenueGirls: custom.revenueGirls,
    revenueTotal: custom.revenueTotal,
  });
  return rows;
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function seedSchoolsFromJson(paths: ScrapedDataPaths, repoRoot?: string): Promise<number> {
  if (!paths.schoolsJson) return 0;
  try {
    await fs.access(paths.schoolsJson);
  } catch {
    return 0;
  }
  const prisma = getPrisma();
  const raw = await fs.readFile(paths.schoolsJson, "utf8");
  const rows = JSON.parse(raw) as SchoolsJsonRow[];
  let n = 0;
  for (const row of rows) {
    const udise = normalizeUdise(row.udise_code);
    if (!/^\d{11}$/.test(udise)) continue;

    const canonicalPdf = path.join(paths.pdfsDir, `${udise}.pdf`);
    let pdfRel: string;
    try {
      await fs.access(canonicalPdf);
      pdfRel = toRepoRelative(canonicalPdf, repoRoot);
    } catch {
      pdfRel = row.pdf_path
        ? toRepoRelative(row.pdf_path, repoRoot)
        : `tools/pmshri-crawler/data/pdfs/${udise}.pdf`;
    }

    const canonicalShot = path.join(paths.screenshotsDir, `${udise}.png`);
    let shotRel: string | undefined;
    try {
      await fs.access(canonicalShot);
      shotRel = toRepoRelative(canonicalShot, repoRoot);
    } catch {
      shotRel = row.screenshot_path ? toRepoRelative(row.screenshot_path, repoRoot) : undefined;
    }

    const data: Prisma.SchoolCreateInput = {
      udise,
      schoolName: row.school_name || `School ${udise}`,
      apiStateName: row.state ?? null,
      geographicState: row.arcgis_state_label ?? row.state ?? null,
      geographicDistrict: row.district ?? null,
      blockName: row.address ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      lgdDistrictId: row.lgd_district_id ?? null,
      hmEmail: row.hm_email ?? null,
      hmMobile: row.hm_mobile ?? null,
      pdfRelativePath: pdfRel,
      screenshotRelativePath: shotRel ?? null,
      parsingStatus: "PENDING",
    };

    await prisma.school.upsert({
      where: { udise },
      create: data,
      update: {
        schoolName: data.schoolName,
        apiStateName: data.apiStateName,
        geographicState: data.geographicState,
        geographicDistrict: data.geographicDistrict,
        blockName: data.blockName,
        latitude: data.latitude,
        longitude: data.longitude,
        lgdDistrictId: data.lgdDistrictId,
        hmEmail: data.hmEmail,
        hmMobile: data.hmMobile,
        pdfRelativePath: data.pdfRelativePath,
        screenshotRelativePath: data.screenshotRelativePath,
      },
    });
    n++;
  }
  return n;
}

/**
 * Ensure every PDF on disk has a School row (UDISE = filename). PDFs are the source of truth for facts;
 * schools.json only enriches discovery metadata when present.
 */
export async function ensureSchoolStubsFromPdfDir(
  paths: ScrapedDataPaths,
  repoRoot?: string,
): Promise<number> {
  const prisma = getPrisma();
  const files = (await fs.readdir(paths.pdfsDir)).filter((f) => f.toLowerCase().endsWith(".pdf"));
  let n = 0;
  for (const file of files) {
    const udise = normalizeUdise(path.basename(file, path.extname(file)));
    if (!/^\d{11}$/.test(udise)) continue;
    const fullPath = path.join(paths.pdfsDir, file);
    const pdfRel = toRepoRelative(fullPath, repoRoot);
    const shotAbs = path.join(paths.screenshotsDir, `${udise}.png`);
    let shotRel: string | null = null;
    try {
      await fs.access(shotAbs);
      shotRel = toRepoRelative(shotAbs, repoRoot);
    } catch {
      /* screenshot optional */
    }
    await prisma.school.upsert({
      where: { udise },
      create: {
        udise,
        schoolName: `JNV ${udise}`,
        pdfRelativePath: pdfRel,
        screenshotRelativePath: shotRel,
        parsingStatus: "PENDING",
      },
      update: {
        pdfRelativePath: pdfRel,
        ...(shotRel ? { screenshotRelativePath: shotRel } : {}),
      },
    });
    n++;
  }
  return n;
}

export type PdfImportOptions = {
  paths: ScrapedDataPaths;
  repoRoot?: string;
  force?: boolean;
};

/**
 * Runs import work for an existing job row (status should already be RUNNING).
 */
export async function executePdfImportJob(jobId: string, options: PdfImportOptions): Promise<void> {
  const prisma = getPrisma();
  const { paths, repoRoot, force } = options;

  let processed = 0;
  let success = 0;
  let errors = 0;

  try {
    await fs.mkdir(paths.extractionsDir, { recursive: true });
    await ensureSchoolStubsFromPdfDir(paths, repoRoot);
    await seedSchoolsFromJson(paths, repoRoot);
    const files = (await fs.readdir(paths.pdfsDir)).filter((f) => f.toLowerCase().endsWith(".pdf"));
    await prisma.importJob.update({
      where: { id: jobId },
      data: { totalFiles: files.length },
    });

    for (const file of files) {
      const udise = normalizeUdise(path.basename(file, ".pdf"));
      if (!/^\d{11}$/.test(udise)) {
        await prisma.importError.create({
          data: {
            jobId,
            message: `Skip invalid UDISE from filename: ${file}`,
            severity: "warn",
          },
        });
        continue;
      }

      const fullPath = path.join(paths.pdfsDir, file);
      let hash: string;
      try {
        hash = await sha256File(fullPath);
      } catch (e) {
        errors++;
        await prisma.importError.create({
          data: {
            jobId,
            udise,
            message: `Hash/read failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        });
        await prisma.importJob.update({
          where: { id: jobId },
          data: { lastProcessedUdise: udise, processedFiles: ++processed, errorCount: errors },
        });
        continue;
      }

      const existing = await prisma.school.findUnique({ where: { udise } });
      if (!force && existing?.sourcePdfHash === hash && existing.parsingStatus === "COMPLETE") {
        processed++;
        await prisma.importJob.update({
          where: { id: jobId },
          data: { processedFiles: processed, lastProcessedUdise: udise },
        });
        continue;
      }

      let buffer: Buffer;
      try {
        buffer = await fs.readFile(fullPath);
      } catch (e) {
        errors++;
        await prisma.importError.create({
          data: {
            jobId,
            udise,
            message: `Read PDF failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        });
        processed++;
        await prisma.importJob.update({
          where: { id: jobId },
          data: { processedFiles: processed, errorCount: errors, lastProcessedUdise: udise },
        });
        continue;
      }

      try {
        const extracted = await extractPdfText(buffer);
        const normalized = parseReportCardText(extracted.text, udise);
        const meta = reportCardExtractionMeta(normalized, extracted.text, udise);
        const pdfRel = toRepoRelative(fullPath, repoRoot);

        const sp = normalized.schoolProfile;
        const mergedName =
          (sp?.name?.trim() ? sp.name.trim() : undefined) || existing?.schoolName || `JNV ${udise}`;
        const geoState =
          (sp?.state?.trim() ? sp.state.trim() : undefined) || existing?.geographicState || null;
        const geoDist =
          (sp?.district?.trim() ? sp.district.trim() : undefined) || existing?.geographicDistrict || null;

        const st = normalized.students;
        const totalStudents = st?.total ?? undefined;
        const totalBoys = st?.boys ?? undefined;
        const totalGirls = st?.girls ?? undefined;

        const snapshotPayload = buildReportCardSnapshotPayload({
          text: extracted.text,
          structured: normalized,
          sourcePdfHash: hash,
          pdfRelativePath: pdfRel,
          extractorVersion: REPORT_CARD_PARSER_VERSION,
          extraction: {
            charCount: extracted.charCount,
            pages: extracted.pages,
            usedOcr: extracted.usedOcr,
          },
        });

        const infraFacilityPatch =
          normalized.infra !== undefined ? schoolFacilityScalarsFromInfra(normalized.infra) : {};
        const totalTeachersPatch =
          normalized.teachers?.total != null ? { totalTeachers: normalized.teachers.total } : {};

        await prisma.$transaction(
          async (tx) => {
            const school = await tx.school.upsert({
              where: { udise },
              create: {
                udise,
                schoolName: mergedName,
                geographicState: geoState,
                geographicDistrict: geoDist,
                totalStudents: totalStudents ?? null,
                totalBoys: totalBoys ?? null,
                totalGirls: totalGirls ?? null,
                sourcePdfHash: hash,
                pdfRelativePath: pdfRel,
                extractorVersion: REPORT_CARD_PARSER_VERSION,
                parsingStatus: meta.confidence >= 0.65 ? "COMPLETE" : "PARTIAL",
                lastPdfExtractedAt: new Date(),
                overallExtractionConfidence: meta.confidence,
                importLastError: null,
                ...infraFacilityPatch,
                ...totalTeachersPatch,
              },
              update: {
                schoolName: mergedName,
                geographicState: geoState ?? undefined,
                geographicDistrict: geoDist ?? undefined,
                totalStudents: totalStudents ?? undefined,
                totalBoys: totalBoys ?? undefined,
                totalGirls: totalGirls ?? undefined,
                sourcePdfHash: hash,
                pdfRelativePath: pdfRel,
                extractorVersion: REPORT_CARD_PARSER_VERSION,
                parsingStatus: meta.confidence >= 0.65 ? "COMPLETE" : "PARTIAL",
                lastPdfExtractedAt: new Date(),
                overallExtractionConfidence: meta.confidence,
                importLastError: null,
                ...infraFacilityPatch,
                ...totalTeachersPatch,
              },
            });

            await tx.schoolEnrolmentSocial.deleteMany({ where: { udise } });
            if (normalized.enrolmentSocial) {
              const socialRows = buildEnrolmentSocialCreateManyData(udise, normalized.enrolmentSocial);
              if (socialRows.length > 0) {
                await tx.schoolEnrolmentSocial.createMany({ data: socialRows });
              }
            }

            await tx.schoolEnrolmentMinority.deleteMany({ where: { udise } });
            if (normalized.enrolmentMinority && minorityHasData(normalized.enrolmentMinority)) {
              const minorityRows = buildEnrolmentMinorityCreateManyData(udise, normalized.enrolmentMinority);
              if (minorityRows.length > 0) {
                await tx.schoolEnrolmentMinority.createMany({ data: minorityRows });
              }
            }

            await tx.schoolEnrolmentOthers.deleteMany({ where: { udise } });
            if (normalized.enrolmentOthers && othersHasData(normalized.enrolmentOthers)) {
              const othersRows = buildEnrolmentOthersCreateManyData(udise, normalized.enrolmentOthers);
              if (othersRows.length > 0) {
                await tx.schoolEnrolmentOthers.createMany({ data: othersRows });
              }
            }

            await tx.schoolEnrolmentAge.deleteMany({ where: { udise } });
            if (normalized.enrolmentAge && ageHasData(normalized.enrolmentAge)) {
              const ageRows = buildEnrolmentAgeCreateManyData(udise, normalized.enrolmentAge);
              if (ageRows.length > 0) {
                await tx.schoolEnrolmentAge.createMany({ data: ageRows });
              }
            }

            await tx.schoolInfra.deleteMany({ where: { udise } });
            if (normalized.infra && infraHasData(normalized.infra)) {
              await tx.schoolInfra.create({
                data: buildSchoolInfraCreateData(udise, normalized.infra),
              });
            }

            await tx.schoolDigitalFacilities.deleteMany({ where: { udise } });
            if (normalized.digital && digitalHasData(normalized.digital)) {
              await tx.schoolDigitalFacilities.create({
                data: buildSchoolDigitalCreateData(udise, normalized.digital),
              });
            }

            await tx.schoolTeacherBreakdown.deleteMany({ where: { udise } });
            if (normalized.teachers && teachersHasData(normalized.teachers)) {
              const teacherRows = buildTeacherBreakdownCreateManyData(udise, normalized.teachers);
              if (teacherRows.length > 0) {
                await tx.schoolTeacherBreakdown.createMany({ data: teacherRows });
              }
            }

            await tx.schoolReportCardSnapshot.upsert({
              where: { udise },
              create: {
                udise,
                academicYear: normalized.academicYear ?? null,
                sourcePdfHash: hash,
                pdfRelativePath: pdfRel,
                screenshotRelativePath: school.screenshotRelativePath ?? null,
                payload: snapshotPayload as object,
                overallConfidence: meta.confidence,
              },
              update: {
                academicYear: normalized.academicYear ?? null,
                sourcePdfHash: hash,
                pdfRelativePath: pdfRel,
                screenshotRelativePath: school.screenshotRelativePath ?? undefined,
                payload: snapshotPayload as object,
                overallConfidence: meta.confidence,
                extractedAt: new Date(),
              },
            });

            await tx.schoolExtractionRaw.create({
              data: {
                udise,
                sectionKey: "full_text",
                rawText: extracted.text.slice(0, 500_000),
                payload: { normalized, meta, snapshotSchemaVersion: snapshotPayload.schemaVersion } as object,
                confidence: meta.confidence,
                extractorVersion: REPORT_CARD_PARSER_VERSION,
                warnings: meta.warnings,
              },
            });

            const refreshed = await tx.school.findUnique({
              where: { udise },
              include: {
                enrolmentSocial: true,
                enrolmentMinority: true,
                enrolmentOthers: true,
                enrolmentAge: true,
                infra: true,
                digital: true,
              },
            });
            if (refreshed) {
              const snap: ProfileCompletenessSnapshot = {
                totalStudents: refreshed.totalStudents,
                totalBoys: refreshed.totalBoys,
                totalGirls: refreshed.totalGirls,
                waterAvailable: refreshed.waterAvailable,
                electricityAvailable: refreshed.electricityAvailable,
                internetAvailable: refreshed.internetAvailable,
                solarAvailable: refreshed.solarAvailable,
                playgroundAvailable: refreshed.playgroundAvailable,
                libraryAvailable: refreshed.libraryAvailable,
                enrolmentSocial: refreshed.enrolmentSocial.map((r) => ({
                  total: r.total,
                  boys: r.boys,
                  girls: r.girls,
                })),
                enrolmentMinority: refreshed.enrolmentMinority.map((r) => ({
                  total: r.total,
                  boys: r.boys,
                  girls: r.girls,
                })),
                enrolmentOthers: refreshed.enrolmentOthers.map((r) => ({
                  total: r.total,
                  boys: r.boys,
                  girls: r.girls,
                })),
                enrolmentAge: refreshed.enrolmentAge.map((r) => ({
                  total: r.total,
                  boys: r.boys,
                  girls: r.girls,
                })),
                infra: refreshed.infra,
                digital: refreshed.digital,
              };
              const complete = calculateCompletenessFromSnapshot(snap);
              const pilot = computePilotSuitable(refreshed, complete);
              await tx.school.update({
                where: { udise },
                data: { profileCompletenessPct: complete, pilotSuitable: pilot },
              });
            }

            const head =
              school.totalStudents ??
              (school.totalBoys != null || school.totalGirls != null
                ? (school.totalBoys ?? 0) + (school.totalGirls ?? 0)
                : 0);
            const revBase = {
              totalStudents: head,
              boys: school.totalBoys ?? undefined,
              girls: school.totalGirls ?? undefined,
            };
            if (revBase.totalStudents > 0) {
              await tx.schoolRevenueScenario.deleteMany({ where: { udise } });
              await tx.schoolRevenueScenario.createMany({
                data: buildRevenueScenarioRows(udise, revBase),
              });
            }
          },
          { maxWait: 15_000, timeout: 60_000 },
        );

        await fs.writeFile(
          path.join(paths.extractionsDir, `${udise}.json`),
          JSON.stringify(snapshotPayload, null, 2),
          "utf8",
        );

        success++;
      } catch (e) {
        errors++;
        await prisma.importError.create({
          data: {
            jobId,
            udise,
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
          },
        });
        await prisma.school.updateMany({
          where: { udise },
          data: {
            parsingStatus: "FAILED",
            importLastError: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
          },
        });
      }

      processed++;
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          processedFiles: processed,
          successCount: success,
          errorCount: errors,
          lastProcessedUdise: udise,
        },
      });
    }

    const status: ImportJobStatus =
      errors === 0 ? "COMPLETED" : success > 0 ? "PARTIAL" : "FAILED";
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status, finishedAt: new Date() },
    });

    try {
      await refreshMapAggregates();
    } catch (err) {
      logger.warn({ err, jobId }, "refreshMapAggregates after import job failed");
    }
  } catch (e) {
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
      },
    });
    await prisma.importError.create({
      data: {
        jobId,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      },
    });
    throw e;
  }
}

/** CLI / synchronous: create job and await completion. */
export async function runPdfImport(options: PdfImportOptions): Promise<{ jobId: string }> {
  const prisma = getPrisma();
  const job = await prisma.importJob.create({
    data: { status: "RUNNING", startedAt: new Date(), forceReextract: !!options.force },
  });
  await executePdfImportJob(job.id, options);
  return { jobId: job.id };
}

/** HTTP: return job id immediately; work continues in background. */
export async function enqueuePdfImport(options: PdfImportOptions): Promise<{ jobId: string }> {
  const prisma = getPrisma();
  const job = await prisma.importJob.create({
    data: { status: "RUNNING", startedAt: new Date(), forceReextract: !!options.force },
  });
  void executePdfImportJob(job.id, options).catch((err) => {
    logger.error({ err, jobId: job.id }, "Background import job failed");
  });
  return { jobId: job.id };
}
