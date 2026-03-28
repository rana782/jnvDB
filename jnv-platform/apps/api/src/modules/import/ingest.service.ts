import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ScrapedDataPaths } from "../../config/paths.js";
import { toRepoRelative } from "../../config/paths.js";
import { getPrisma } from "../../shared/prisma.js";
import { normalizeUdise } from "../../shared/udise.js";
import { extractPdfText, parseReportCardText } from "./pdf-extract.js";
import {
  computePilotSuitable,
  computeProfileCompleteness,
} from "../analytics/derived-metrics.js";
import { calculateRevenue, scenarioPresets } from "../analytics/revenue-calculator.js";
import { logger } from "../../shared/logger.js";
import type { ImportJobStatus, Prisma } from "@prisma/client";

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

function yn(s: string | undefined): boolean | undefined {
  if (!s) return undefined;
  const t = s.toLowerCase();
  if (t === "yes" || t === "1" || t === "true") return true;
  if (t === "no" || t === "0" || t === "false") return false;
  return undefined;
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
      internetAvailable: yn(row.internet_availability) ?? null,
      electricityAvailable: yn(row.electricity_availability) ?? null,
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
        internetAvailable: data.internetAvailable,
        electricityAvailable: data.electricityAvailable,
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
    await seedSchoolsFromJson(paths, repoRoot);
    await ensureSchoolStubsFromPdfDir(paths, repoRoot);
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
        const parsed = parseReportCardText(extracted.text, udise);
        const pdfRel = toRepoRelative(fullPath, repoRoot);

        const mergedName = parsed.schoolName || existing?.schoolName || `JNV ${udise}`;
        const geoState = parsed.state || existing?.geographicState;
        const geoDist = parsed.district || existing?.geographicDistrict;

        const updateData: Prisma.SchoolUpdateInput = {
          schoolName: mergedName,
          geographicState: geoState ?? undefined,
          geographicDistrict: geoDist ?? undefined,
          blockName: parsed.block ?? undefined,
          pincode: parsed.pincode ?? undefined,
          totalStudents: parsed.totalStudents ?? undefined,
          totalBoys: parsed.totalBoys ?? undefined,
          totalGirls: parsed.totalGirls ?? undefined,
          totalTeachers: parsed.totalTeachers ?? undefined,
          waterAvailable: parsed.water ?? undefined,
          electricityAvailable: parsed.electricity ?? undefined,
          internetAvailable: parsed.internet ?? undefined,
          solarAvailable: parsed.solar ?? undefined,
          playgroundAvailable: parsed.playground ?? undefined,
          libraryAvailable: parsed.library ?? undefined,
          sourcePdfHash: hash,
          pdfRelativePath: pdfRel,
          extractorVersion: "1.0.0",
          parsingStatus: parsed.confidence >= 0.65 ? "COMPLETE" : "PARTIAL",
          academicYear: parsed.academicYear ?? undefined,
          lastPdfExtractedAt: new Date(),
          overallExtractionConfidence: parsed.confidence,
          importLastError: null,
        };

        const school = await prisma.school.upsert({
          where: { udise },
          create: {
            udise,
            schoolName: mergedName,
            geographicState: geoState,
            geographicDistrict: geoDist,
            blockName: parsed.block ?? null,
            pincode: parsed.pincode ?? null,
            totalStudents: parsed.totalStudents ?? null,
            totalBoys: parsed.totalBoys ?? null,
            totalGirls: parsed.totalGirls ?? null,
            totalTeachers: parsed.totalTeachers ?? null,
            waterAvailable: parsed.water ?? null,
            electricityAvailable: parsed.electricity ?? null,
            internetAvailable: parsed.internet ?? null,
            solarAvailable: parsed.solar ?? null,
            playgroundAvailable: parsed.playground ?? null,
            libraryAvailable: parsed.library ?? null,
            sourcePdfHash: hash,
            pdfRelativePath: pdfRel,
            extractorVersion: "1.0.0",
            parsingStatus: parsed.confidence >= 0.65 ? "COMPLETE" : "PARTIAL",
            academicYear: parsed.academicYear ?? null,
            lastPdfExtractedAt: new Date(),
            overallExtractionConfidence: parsed.confidence,
            importLastError: null,
          },
          update: updateData,
        });

        const extractionPayload = {
          udise,
          sourcePdfHash: hash,
          pdfRelativePath: pdfRel,
          academicYear: parsed.academicYear ?? null,
          parsed,
          extraction: {
            charCount: extracted.charCount,
            pages: extracted.pages,
            usedOcr: extracted.usedOcr,
          },
          confidence: parsed.confidence,
          warnings: parsed.warnings,
          importedAt: new Date().toISOString(),
        };

        await fs.writeFile(
          path.join(paths.extractionsDir, `${udise}.json`),
          JSON.stringify(extractionPayload, null, 2),
          "utf8",
        );

        await prisma.schoolReportCardSnapshot.upsert({
          where: { udise },
          create: {
            udise,
            academicYear: parsed.academicYear ?? null,
            sourcePdfHash: hash,
            pdfRelativePath: pdfRel,
            screenshotRelativePath: school.screenshotRelativePath ?? null,
            payload: extractionPayload as object,
            overallConfidence: parsed.confidence,
          },
          update: {
            academicYear: parsed.academicYear ?? undefined,
            sourcePdfHash: hash,
            pdfRelativePath: pdfRel,
            screenshotRelativePath: school.screenshotRelativePath ?? undefined,
            payload: extractionPayload as object,
            overallConfidence: parsed.confidence,
            extractedAt: new Date(),
          },
        });

        await prisma.schoolExtractionRaw.create({
          data: {
            udise,
            sectionKey: "full_text",
            rawText: extracted.text.slice(0, 500_000),
            payload: parsed as object,
            confidence: parsed.confidence,
            extractorVersion: "1.0.0",
            warnings: parsed.warnings,
          },
        });

        const complete = computeProfileCompleteness(school);
        const pilot = computePilotSuitable(school, complete);
        await prisma.school.update({
          where: { udise },
          data: { profileCompletenessPct: complete, pilotSuitable: pilot },
        });

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
          await prisma.schoolRevenueScenario.deleteMany({ where: { udise } });
          for (const kind of ["LOW", "MEDIUM", "HIGH"] as const) {
            const r = scenarioPresets(kind, revBase);
            await prisma.schoolRevenueScenario.create({
              data: {
                udise,
                kind,
                label: kind,
                inputs: revBase as object,
                monthlyRevenue: r.monthlyRevenue,
                annualRevenue: r.annualRevenue,
                revenueBoys: r.revenueBoys,
                revenueGirls: r.revenueGirls,
                revenueTotal: r.revenueTotal,
              },
            });
          }
          const custom = calculateRevenue({
            ...revBase,
            pricePerWash: 30,
            occupancyRate: 0.85,
            washesPerStudentPerMonth: 4,
          });
          await prisma.schoolRevenueScenario.create({
            data: {
              udise,
              kind: "CUSTOM",
              label: "default",
              inputs: { pricePerWash: 30, occupancy: 0.85, washesPerMonth: 4 },
              monthlyRevenue: custom.monthlyRevenue,
              annualRevenue: custom.annualRevenue,
              revenueBoys: custom.revenueBoys,
              revenueGirls: custom.revenueGirls,
              revenueTotal: custom.revenueTotal,
            },
          });
        }

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
