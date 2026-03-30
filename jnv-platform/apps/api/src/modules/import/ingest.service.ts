import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ScrapedDataPaths } from "../../config/paths.js";
import { toRepoRelative } from "../../config/paths.js";
import { loadEnv } from "../../config/env.js";
import { buildPdfInventory, type PdfInventory } from "./pdf-inventory.js";
import {
  loadBulkImportCheckpoint,
  writeBulkImportCheckpoint,
} from "./import-checkpoint.js";
import { getPrisma } from "../../shared/prisma.js";
import { canonicalizeStateDisplay } from "../../shared/geo-normalize.js";
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
import {
  PARSING_COMPLETE_CONFIDENCE_THRESHOLD,
  REPORT_CARD_PARSER_VERSION,
} from "./parser/constants.js";
import type { ReportCardNormalized } from "./report-card-normalized.js";
import {
  ENROLMENT_AGE_BAND,
  ENROLMENT_MINORITY_CATEGORY,
  ENROLMENT_OTHERS_CATEGORY,
} from "./report-card-normalized.js";
import { computePilotSuitable, type ProfileCompletenessSnapshot } from "../analytics/derived-metrics.js";
import { calculateCompletenessFromSnapshot } from "./completeness.js";
import { scenarioPresets } from "../analytics/revenue-calculator.js";
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

function parseStrengthScore(p: ReturnType<typeof parseReportCardText>): number {
  let score = 0;
  const s = p.students;
  if (s && (s.total > 0 || s.boys > 0 || s.girls > 0)) score += 3;
  if ((p.enrolmentSocial?.total ?? 0) > 0) score += 3;
  if ((p.enrolmentAge?.total ?? 0) > 0) score += 2;
  if ((p.enrolmentMinority?.total ?? 0) > 0) score += 1;
  if ((p.enrolmentOthers?.total ?? 0) > 0) score += 1;
  return score;
}

function looksWeakForKpi(p: ReturnType<typeof parseReportCardText>): boolean {
  return parseStrengthScore(p) === 0;
}

const KV_MARKER_RE = /\b(?:kendriya\s+vidyalaya|kvs\b|vidyalaya\s+sangathan)\b/i;

function looksLikeKvInstitution(rawText: string, parsedSchoolName?: string | null): boolean {
  const name = (parsedSchoolName ?? "").replace(/\s+/g, " ").trim();
  if (name && KV_MARKER_RE.test(name)) return true;
  const header = rawText
    .split(/\r?\n/)
    .slice(0, 40)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
  return KV_MARKER_RE.test(header);
}

function schoolNameLooksKv(v?: string | null): boolean {
  return KV_MARKER_RE.test((v ?? "").replace(/\s+/g, " ").trim());
}

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

export function buildRevenueScenarioRows(
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
  return rows;
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function seedSchoolsFromJson(
  paths: ScrapedDataPaths,
  repoRoot?: string,
  canonicalPdfByUdise?: ReadonlyMap<string, string>,
): Promise<number> {
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

    let pdfAbs = canonicalPdfByUdise?.get(udise);
    if (!pdfAbs) {
      const flat = path.join(paths.pdfsDir, `${udise}.pdf`);
      try {
        await fs.access(flat);
        pdfAbs = flat;
      } catch {
        pdfAbs = undefined;
      }
    }
    let pdfRel: string;
    if (pdfAbs) {
      pdfRel = toRepoRelative(pdfAbs, repoRoot);
    } else {
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
      apiStateName: canonicalizeStateDisplay(row.state) ?? null,
      geographicState: canonicalizeStateDisplay(row.arcgis_state_label ?? row.state) ?? null,
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

export async function ensureSchoolStubsFromInventory(
  inv: PdfInventory,
  paths: ScrapedDataPaths,
  repoRoot?: string,
): Promise<number> {
  const prisma = getPrisma();
  let n = 0;
  const entries = [...inv.udiseToPdfPath.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [udise, fullPath] of entries) {
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

/**
 * Ensure every PDF on disk has a School row (UDISE = filename). PDFs are the source of truth for facts;
 * schools.json only enriches discovery metadata when present.
 */
export async function ensureSchoolStubsFromPdfDir(
  paths: ScrapedDataPaths,
  repoRoot?: string,
  recursive = true,
): Promise<number> {
  const inv = await buildPdfInventory(paths.pdfsDir, recursive);
  return ensureSchoolStubsFromInventory(inv, paths, repoRoot);
}

export type PdfImportOptions = {
  paths: ScrapedDataPaths;
  repoRoot?: string;
  force?: boolean;
  /** Default true: discover `.pdf` under `pdfsDir` recursively. */
  recursive?: boolean;
  /** Written after successful imports (merged with prior file if present). */
  checkpointFile?: string;
  /** Skip UDISE codes listed in `checkpointFile` (use after a partial run). Ignored when `force` is true. */
  resumeFromCheckpoint?: boolean;
  /** Emit progress every N files (default 25). */
  progressEvery?: number;
};

/**
 * Runs import work for an existing job row (status should already be RUNNING).
 */
export async function executePdfImportJob(jobId: string, options: PdfImportOptions): Promise<void> {
  const prisma = getPrisma();
  const { paths, repoRoot, force } = options;
  const env = loadEnv();
  const recursive = options.recursive !== false;
  const progressEvery = options.progressEvery ?? 25;

  let processed = 0;
  let success = 0;
  let errors = 0;
  let skippedResume = 0;
  let skippedIdempotent = 0;
  let skippedPolicy = 0;

  const checkpointAccumulator = new Set<string>();
  if (options.checkpointFile) {
    if (options.resumeFromCheckpoint && !force) {
      const prev = await loadBulkImportCheckpoint(options.checkpointFile);
      for (const u of prev) checkpointAccumulator.add(u);
    }
  }
  const skipUdises =
    options.checkpointFile && options.resumeFromCheckpoint && !force ? checkpointAccumulator : new Set<string>();

  try {
    await fs.mkdir(paths.extractionsDir, { recursive: true });
    const inv = await buildPdfInventory(paths.pdfsDir, recursive);
    for (const { udise, path: dupPath } of inv.duplicatePaths) {
      await prisma.importError.create({
        data: {
          jobId,
          udise,
          message: `Duplicate PDF skipped (canonical path chosen): ${dupPath}`,
          severity: "warn",
        },
      });
    }
    await ensureSchoolStubsFromInventory(inv, paths, repoRoot);
    await seedSchoolsFromJson(paths, repoRoot, inv.udiseToPdfPath);

    const entries = [...inv.udiseToPdfPath.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    await prisma.importJob.update({
      where: { id: jobId },
      data: { totalFiles: entries.length },
    });

    const flushCheckpoint = async () => {
      if (options.checkpointFile && checkpointAccumulator.size > 0) {
        await writeBulkImportCheckpoint(options.checkpointFile, checkpointAccumulator);
      }
    };

    for (const [udise, fullPath] of entries) {
      if (skipUdises.has(udise)) {
        skippedResume++;
        processed++;
        await prisma.importJob.update({
          where: { id: jobId },
          data: { processedFiles: processed, lastProcessedUdise: udise },
        });
        if (processed % progressEvery === 0) {
          logger.info(
            { jobId, processed, total: entries.length, success, errors, skippedResume, skippedIdempotent, skippedPolicy },
            "import progress",
          );
        }
        continue;
      }
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
      if (existing && schoolNameLooksKv(existing.schoolName)) {
        await prisma.importError.create({
          data: {
            jobId,
            udise,
            severity: "warn",
            message: "Policy skip: Kendriya Vidyalaya/KVS marker in existing schoolName; deleting row",
          },
        });
        await prisma.school.delete({ where: { udise } });
        skippedPolicy++;
        processed++;
        checkpointAccumulator.add(udise);
        await prisma.importJob.update({
          where: { id: jobId },
          data: { processedFiles: processed, lastProcessedUdise: udise },
        });
        continue;
      }
      if (!force && existing?.sourcePdfHash === hash && existing.parsingStatus === "COMPLETE") {
        skippedIdempotent++;
        processed++;
        checkpointAccumulator.add(udise);
        await prisma.importJob.update({
          where: { id: jobId },
          data: { processedFiles: processed, lastProcessedUdise: udise },
        });
        if (skippedIdempotent % 50 === 0) await flushCheckpoint();
        if (processed % progressEvery === 0) {
          logger.info(
            { jobId, processed, total: entries.length, success, errors, skippedResume, skippedIdempotent, skippedPolicy },
            "import progress",
          );
        }
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
        let extracted = await extractPdfText(buffer);
        let normalized = parseReportCardText(extracted.text, udise);
        if (env.REPORT_CARD_OCR_WEAK_RETRY && looksWeakForKpi(normalized) && !extracted.usedOcr) {
          const ocrExtracted = await extractPdfText(buffer, { forceOcr: true });
          const ocrNormalized = parseReportCardText(ocrExtracted.text, udise);
          if (parseStrengthScore(ocrNormalized) > parseStrengthScore(normalized)) {
            extracted = ocrExtracted;
            normalized = ocrNormalized;
          }
        }
        if (looksLikeKvInstitution(extracted.text, normalized.schoolProfile?.name)) {
          await prisma.importError.create({
            data: {
              jobId,
              udise,
              severity: "warn",
              message: "Policy skip: Kendriya Vidyalaya/KVS marker detected in PDF; school removed",
            },
          });
          await prisma.school.deleteMany({ where: { udise } });
          skippedPolicy++;
          processed++;
          checkpointAccumulator.add(udise);
          await prisma.importJob.update({
            where: { id: jobId },
            data: {
              processedFiles: processed,
              successCount: success,
              errorCount: errors,
              lastProcessedUdise: udise,
            },
          });
          continue;
        }
        const meta = reportCardExtractionMeta(normalized, extracted.text, udise);
        const pdfRel = toRepoRelative(fullPath, repoRoot);

        const sp = normalized.schoolProfile;
        const mergedName =
          (sp?.name?.trim() ? sp.name.trim() : undefined) || existing?.schoolName || `JNV ${udise}`;
        const geoState =
          canonicalizeStateDisplay(sp?.state?.trim() ? sp.state.trim() : undefined) ??
          canonicalizeStateDisplay(existing?.geographicState) ??
          null;
        const geoDist =
          (sp?.district?.trim() ? sp.district.trim() : undefined) || existing?.geographicDistrict || null;

        const st = normalized.students;
        const socialTotal = normalized.enrolmentSocial?.total ?? null;
        const totalStudents = st?.total ?? (socialTotal != null && socialTotal > 0 ? socialTotal : undefined);
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
                parsingStatus:
                  meta.confidence >= PARSING_COMPLETE_CONFIDENCE_THRESHOLD ? "COMPLETE" : "PARTIAL",
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
                parsingStatus:
                  meta.confidence >= PARSING_COMPLETE_CONFIDENCE_THRESHOLD ? "COMPLETE" : "PARTIAL",
                lastPdfExtractedAt: new Date(),
                overallExtractionConfidence: meta.confidence,
                importLastError: null,
                ...infraFacilityPatch,
                ...totalTeachersPatch,
              },
            });

            if (normalized.enrolmentSocial) {
              const socialRows = buildEnrolmentSocialCreateManyData(udise, normalized.enrolmentSocial);
              if (socialRows.length > 0) {
                await tx.schoolEnrolmentSocial.deleteMany({ where: { udise } });
                await tx.schoolEnrolmentSocial.createMany({ data: socialRows });
              }
            }

            if (normalized.enrolmentMinority && minorityHasData(normalized.enrolmentMinority)) {
              const minorityRows = buildEnrolmentMinorityCreateManyData(udise, normalized.enrolmentMinority);
              if (minorityRows.length > 0) {
                await tx.schoolEnrolmentMinority.deleteMany({ where: { udise } });
                await tx.schoolEnrolmentMinority.createMany({ data: minorityRows });
              }
            }

            if (normalized.enrolmentOthers && othersHasData(normalized.enrolmentOthers)) {
              const othersRows = buildEnrolmentOthersCreateManyData(udise, normalized.enrolmentOthers);
              if (othersRows.length > 0) {
                await tx.schoolEnrolmentOthers.deleteMany({ where: { udise } });
                await tx.schoolEnrolmentOthers.createMany({ data: othersRows });
              }
            }

            if (normalized.enrolmentAge && ageHasData(normalized.enrolmentAge)) {
              const ageRows = buildEnrolmentAgeCreateManyData(udise, normalized.enrolmentAge);
              if (ageRows.length > 0) {
                await tx.schoolEnrolmentAge.deleteMany({ where: { udise } });
                await tx.schoolEnrolmentAge.createMany({ data: ageRows });
              }
            }

            if (normalized.infra && infraHasData(normalized.infra)) {
              await tx.schoolInfra.deleteMany({ where: { udise } });
              await tx.schoolInfra.create({
                data: buildSchoolInfraCreateData(udise, normalized.infra),
              });
            }

            if (normalized.digital && digitalHasData(normalized.digital)) {
              await tx.schoolDigitalFacilities.deleteMany({ where: { udise } });
              await tx.schoolDigitalFacilities.create({
                data: buildSchoolDigitalCreateData(udise, normalized.digital),
              });
            }

            if (normalized.teachers && teachersHasData(normalized.teachers)) {
              const teacherRows = buildTeacherBreakdownCreateManyData(udise, normalized.teachers);
              if (teacherRows.length > 0) {
                await tx.schoolTeacherBreakdown.deleteMany({ where: { udise } });
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
        checkpointAccumulator.add(udise);
        if (success % 25 === 0) await flushCheckpoint();
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
      if (processed % progressEvery === 0) {
        logger.info(
          { jobId, processed, total: entries.length, success, errors, skippedResume, skippedIdempotent, skippedPolicy },
          "import progress",
        );
      }
    }

    await flushCheckpoint();

    const summaryReport = {
      jobId,
      pdfPathsOnDisk: entries.length + inv.duplicatePaths.length,
      uniqueUdise: entries.length,
      duplicatePdfPathsSkipped: inv.duplicatePaths.length,
      processed,
      success,
      errors,
      skippedResume,
      skippedIdempotent,
      skippedPolicy,
    };
    console.log(`\n=== Bulk PDF import summary ===\n${JSON.stringify(summaryReport, null, 2)}\n`);
    logger.info(summaryReport, "Bulk PDF import summary");

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
