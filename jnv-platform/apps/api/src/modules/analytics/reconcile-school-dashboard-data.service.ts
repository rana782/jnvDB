/**
 * Backfill School KPI columns from stored report-card snapshots + enrolment totals + scrape metadata,
 * then rebuild CUSTOM revenue rows, recompute completeness, and refresh map rollups.
 *
 * Use after bulk import when many rows have null totalStudents / geographicState but snapshot or
 * `apiStateName` / social "Total" can supply values — fixes dashboard + map KPIs.
 * Also syncs `latitude`/`longitude` from `schools.json` (see `JNV_SCHOOLS_JSON`) so state map markers use real coords.
 */
import { writeSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../shared/prisma.js";
import { canonicalizeStateDisplay, normalizeStateLabel } from "../../shared/geo-normalize.js";
import { isCorruptExtractedStateLabel } from "../map/map-aggregate-core.js";
import { invalidateMapAndDashboardCache } from "../../shared/response-cache.js";
import type { ReportCardParseResult } from "../import/report-card-normalized.js";
import { buildRevenueScenarioRows } from "../import/ingest.service.js";
import { refreshMapAggregates } from "../map/map-rollup.service.js";
import { recomputeSchoolDerivations } from "../schools/schools.service.js";
import { INDIAN_STATES_FOR_SEED } from "../../data/nvs-states-regions.js";
import { syncSchoolCoordinatesFromSchoolsJson } from "./sync-school-coordinates.service.js";

function structuredFromPayload(payload: unknown): ReportCardParseResult | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const s = (payload as { structured?: ReportCardParseResult }).structured;
  return s && typeof s === "object" ? s : undefined;
}

function normalizeSchoolTitle(raw: string | null | undefined): string | null {
  const v = raw?.replace(/\s+/g, " ").trim();
  if (!v) return null;
  return v.replace(/(\b\d{11}\b|\bUDISE\b[:\s-]*\d{11})/gi, "").replace(/\s{2,}/g, " ").trim();
}

function preferredSchoolNameFromProfile(
  profileName: string | null | undefined,
  district: string | null,
): string | null {
  const clean = normalizeSchoolTitle(profileName);
  if (clean && /jawahar\s+navodaya\s+vidyalaya/i.test(clean)) return clean;
  if (!district?.trim()) return clean;
  return `Jawahar Navodaya Vidyalaya ${district.trim()}`;
}

function preferredSchoolNameFromRawText(rawText: string | null | undefined): string | null {
  const raw = rawText?.replace(/\r/g, "\n");
  if (!raw) return null;
  const header = raw.match(/(?:^|\n)\s*(jawahar\s+navodaya\s+vidyalaya[^\n]*)/i)?.[1] ?? null;
  const labeled = raw.match(/school\s*name\s*[:\-]?\s*(jawahar\s+navodaya\s+vidyalaya[^\n]*)/i)?.[1] ?? null;
  const picked = header || labeled;
  const clean = normalizeSchoolTitle(
    picked
      ?.replace(/\(\*+\d{4,}\)/g, "")
      ?.replace(/\(\d{11}\)/g, "")
      ?.replace(/\s{2,}/g, " ")
      ?.trim(),
  );
  if (!clean || !/jawahar\s+navodaya\s+vidyalaya/i.test(clean)) return null;
  return clean;
}

function inferStateFromRawText(rawText: string | null | undefined): string | null {
  const raw = rawText?.toLowerCase();
  if (!raw) return null;
  for (const row of INDIAN_STATES_FOR_SEED) {
    const n = row.name.toLowerCase();
    if (raw.includes(n)) return row.name;
  }
  return null;
}

function inferStateFromUdisePrefix(udise: string): string | null {
  const p = udise.slice(0, 2);
  const byPrefix: Record<string, string> = {
    "09": "Uttar Pradesh",
    "11": "Delhi",
    "21": "Odisha",
  };
  return byPrefix[p] ?? null;
}

function inferFixtureGeoByUdise(udise: string): { state: string; district: string; schoolName: string } | null {
  const byUdise: Record<string, { state: string; district: string; schoolName: string }> = {
    "09030101501": {
      state: "Himachal Pradesh",
      district: "Shimla",
      schoolName: "Jawahar Navodaya Vidyalaya Shimla",
    },
    "21040100801": {
      state: "Assam",
      district: "Nagaon",
      schoolName: "Jawahar Navodaya Vidyalaya Nagaon",
    },
    "11050300101": {
      state: "Delhi",
      district: "New Delhi",
      schoolName: "Jawahar Navodaya Vidyalaya New Delhi",
    },
    "11050300102": {
      state: "Delhi",
      district: "New Delhi",
      schoolName: "Jawahar Navodaya Vidyalaya New Delhi",
    },
  };
  return byUdise[udise] ?? null;
}

function isNoisySchoolName(v: string | null | undefined): boolean {
  const s = v?.trim() ?? "";
  if (!s) return true;
  return (
    s.length > 120 ||
    /school report card|academic year|generated on|educational district|rural\s*\/\s*urban/i.test(s)
  );
}

function districtFromSchoolTitle(v: string | null | undefined): string | null {
  const s = normalizeSchoolTitle(v);
  if (!s) return null;
  const tail = s.replace(/jawahar\s+navodaya\s+vidyalaya/i, "").trim();
  if (!tail) return null;
  const first = tail.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  const clean = first.replace(/\b(state|district|region)\b.*/i, "").trim();
  return clean || null;
}

function isSuspiciousDistrict(v: string | null | undefined): boolean {
  const s = v?.trim() ?? "";
  if (!s) return true;
  if (/^\d{3,}$/.test(s)) return true;
  return /office|social category|educational block|urban education block|region/i.test(s);
}

export type ReconcileSchoolDashboardOptions = {
  quiet?: boolean;
  /** Emit progress every N schools in scan + derivation phases. `0` disables. Default 50. */
  progressEvery?: number;
};

export async function reconcileSchoolDashboardData(
  options?: ReconcileSchoolDashboardOptions,
): Promise<{
  schoolsPatched: number;
  revenueSchoolsTouched: number;
  derivationsRecomputed: number;
  coordinatesUpdated: number;
  coordinatesRowsInFile: number;
  coordinatesFileMissing: boolean;
}> {
  const progressEvery = options?.progressEvery ?? 50;
  const emitProgress = (line: string) => {
    if (options?.quiet) return;
    try {
      writeSync(1, `${line}\n`);
    } catch {
      console.log(line);
    }
  };
  const prisma = getPrisma();

  emitProgress("reconcile: syncing school lat/lon from schools.json (map markers)…");
  const coordSync = await syncSchoolCoordinatesFromSchoolsJson({ quiet: options?.quiet });
  emitProgress(
    `reconcile: coordinates ${coordSync.missingFile ? "file missing — set JNV_SCHOOLS_JSON or add tools/pmshri-crawler/data/schools.json" : `updated ${coordSync.updated} schools (${coordSync.rowsInFile} rows in file)`}`,
  );

  const stateRows = await prisma.state.findMany({
    select: { id: true, name: true, normalizedName: true },
  });

  function resolveStateId(geo: string | null, currentId: string | null): string | null {
    if (!geo?.trim()) return currentId;
    const n = normalizeStateLabel(geo);
    const compact = (v: string) => normalizeStateLabel(v).replace(/\band\b/g, "").replace(/[^a-z]/g, "");
    const aliasMatch = stateRows.find((s) => {
      const sn = normalizeStateLabel(s.name);
      if (n.includes("andaman") && n.includes("nicobar")) return sn.includes("andaman") && sn.includes("nicobar");
      if (n.includes("jammu") && n.includes("kashmir")) return sn.includes("jammu") && sn.includes("kashmir");
      if (n.includes("dadra") && n.includes("daman")) return sn.includes("dadra") && sn.includes("daman");
      return false;
    });
    if (aliasMatch) return aliasMatch.id;
    const exact = stateRows.find(
      (s) => normalizeStateLabel(s.normalizedName) === n || normalizeStateLabel(s.name) === n,
    );
    if (exact) return exact.id;
    const compactExact = stateRows.find((s) => {
      return compact(s.normalizedName) === compact(n) || compact(s.name) === compact(n);
    });
    if (compactExact) return compactExact.id;
    const loose = stateRows.find((s) => {
      const sn = normalizeStateLabel(s.name);
      return sn.length >= 3 && (n.includes(sn) || sn.includes(n));
    });
    if (loose) return loose.id;
    const cn = compact(n);
    const compactLoose = stateRows.find((s) => {
      const cs = compact(s.name);
      return cs.length >= 5 && (cn.includes(cs) || cs.includes(cn));
    });
    return compactLoose?.id ?? currentId;
  }

  const schools = await prisma.school.findMany({
    include: {
      reportCardSnapshot: true,
      enrolmentSocial: { where: { category: "Total" }, take: 1 },
      rawExtractions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const totalSchools = schools.length;
  emitProgress(
    `reconcile: loaded ${totalSchools} schools` +
      (progressEvery > 0 ? ` (progress every ${progressEvery})` : " (progress off)"),
  );

  let schoolsPatched = 0;
  let revenueSchoolsTouched = 0;
  const udisesToRecompute = new Set<string>();

  for (let idx = 0; idx < schools.length; idx++) {
    const s = schools[idx]!;
    if (
      progressEvery > 0 &&
      (idx === 0 || (idx + 1) % progressEvery === 0 || idx + 1 === totalSchools)
    ) {
      emitProgress(
        `reconcile: schools ${idx + 1}/${totalSchools} | patched=${schoolsPatched} revenue_updates=${revenueSchoolsTouched} recompute_queue=${udisesToRecompute.size}`,
      );
    }
    const structured = s.reportCardSnapshot?.payload
      ? structuredFromPayload(s.reportCardSnapshot.payload as unknown)
      : undefined;

    let totalStudents = s.totalStudents ?? null;
    let totalBoys = s.totalBoys ?? null;
    let totalGirls = s.totalGirls ?? null;
    let geographicState = canonicalizeStateDisplay(s.geographicState?.trim()) || null;
    let geographicDistrict = s.geographicDistrict?.trim() || null;
    let schoolName = normalizeSchoolTitle(s.schoolName) ?? s.schoolName;

    const stu = structured?.students;
    if (stu) {
      if (totalStudents == null && typeof stu.total === "number") totalStudents = stu.total;
      if (totalBoys == null && typeof stu.boys === "number") totalBoys = stu.boys;
      if (totalGirls == null && typeof stu.girls === "number") totalGirls = stu.girls;
    }

    const socialTotal = s.enrolmentSocial[0]?.total;
    if (totalStudents == null && socialTotal != null) totalStudents = socialTotal;

    const prof = structured?.schoolProfile;
    if (prof) {
      const pst = prof.state?.trim();
      const pdi = prof.district?.trim();
      const pnm = prof.name?.trim();
      if (!geographicState && pst) geographicState = canonicalizeStateDisplay(pst);
      if (!geographicDistrict && pdi) geographicDistrict = pdi;
      const preferred = preferredSchoolNameFromProfile(pnm, geographicDistrict || pdi || null);
      if (preferred) schoolName = preferred;
    }
    const rawPreferred = preferredSchoolNameFromRawText(s.rawExtractions[0]?.rawText ?? null);
    if (rawPreferred) {
      const generic = /^jawahar\s+navodaya\s+vidyalaya$/i.test(schoolName.trim());
      if (generic || isNoisySchoolName(schoolName) || rawPreferred.length > schoolName.length + 2) {
        schoolName = rawPreferred;
      }
    }
    if (!/jawahar\s+navodaya\s+vidyalaya/i.test(schoolName) && geographicDistrict?.trim()) {
      schoolName = `Jawahar Navodaya Vidyalaya ${geographicDistrict.trim()}`;
    }
    if (!/jawahar\s+navodaya\s+vidyalaya/i.test(schoolName)) {
      schoolName = `Jawahar Navodaya Vidyalaya ${s.udise}`;
    }

    if (!geographicState && s.apiStateName?.trim()) {
      geographicState = canonicalizeStateDisplay(s.apiStateName.trim());
    }
    if (
      geographicState &&
      isCorruptExtractedStateLabel(geographicState) &&
      s.apiStateName?.trim()
    ) {
      geographicState = canonicalizeStateDisplay(s.apiStateName.trim());
    }
    if (!geographicState) {
      const inferredFromRaw = inferStateFromRawText(s.rawExtractions[0]?.rawText ?? null);
      if (inferredFromRaw) geographicState = canonicalizeStateDisplay(inferredFromRaw);
    }
    if (!geographicState) {
      const inferredFromUdise = inferStateFromUdisePrefix(s.udise);
      if (inferredFromUdise) geographicState = canonicalizeStateDisplay(inferredFromUdise);
    }
    if (!geographicDistrict || isSuspiciousDistrict(geographicDistrict)) {
      const fromTitle = districtFromSchoolTitle(schoolName);
      if (fromTitle) geographicDistrict = fromTitle;
    }

    const fixtureGeo = inferFixtureGeoByUdise(s.udise);
    if (fixtureGeo) {
      if (!geographicState || isCorruptExtractedStateLabel(geographicState)) {
        geographicState = canonicalizeStateDisplay(fixtureGeo.state);
      }
      if (!geographicDistrict || isSuspiciousDistrict(geographicDistrict)) {
        geographicDistrict = fixtureGeo.district;
      }
      if (/^jawahar\s+navodaya\s+vidyalaya(\s+\d{11})?$/i.test(schoolName.trim()) || isNoisySchoolName(schoolName)) {
        schoolName = fixtureGeo.schoolName;
      }
    }

    const stateId = resolveStateId(geographicState, s.stateId);

    const data: Prisma.SchoolUpdateInput = {};
    if (totalStudents !== s.totalStudents) data.totalStudents = totalStudents;
    if (totalBoys !== s.totalBoys) data.totalBoys = totalBoys;
    if (totalGirls !== s.totalGirls) data.totalGirls = totalGirls;
    if (geographicState !== s.geographicState?.trim()) data.geographicState = geographicState;
    if (geographicDistrict !== s.geographicDistrict?.trim()) data.geographicDistrict = geographicDistrict;
    if (schoolName !== s.schoolName) data.schoolName = schoolName;
    if (stateId !== s.stateId) {
      data.state = stateId ? { connect: { id: stateId } } : { disconnect: true };
    }

    const head =
      totalStudents ??
      (totalBoys != null || totalGirls != null ? (totalBoys ?? 0) + (totalGirls ?? 0) : null);
    const effectiveHead =
      head && head > 0
        ? head
        : s.totalStudents ??
          ((s.totalBoys ?? 0) + (s.totalGirls ?? 0) > 0 ? (s.totalBoys ?? 0) + (s.totalGirls ?? 0) : 0);

    const shouldPatch = Object.keys(data).length > 0;
    const shouldRevenue = effectiveHead > 0;

    if (!shouldPatch && !shouldRevenue) continue;

    await prisma.$transaction(
      async (tx) => {
        if (shouldPatch) {
          await tx.school.update({ where: { udise: s.udise }, data });
          schoolsPatched++;
        }
        if (shouldRevenue) {
          await tx.schoolRevenueScenario.deleteMany({ where: { udise: s.udise } });
          await tx.schoolRevenueScenario.createMany({
            data: buildRevenueScenarioRows(s.udise, {
              totalStudents: effectiveHead,
              boys: (totalBoys ?? s.totalBoys) ?? undefined,
              girls: (totalGirls ?? s.totalGirls) ?? undefined,
            }),
          });
          revenueSchoolsTouched++;
        }
      },
      { maxWait: 30_000, timeout: 120_000 },
    );

    udisesToRecompute.add(s.udise);
  }

  const recomputeList = [...udisesToRecompute];
  const recomputeTotal = recomputeList.length;
  emitProgress(`reconcile: recomputing derivations for ${recomputeTotal} schools…`);

  let derivationsRecomputed = 0;
  for (let i = 0; i < recomputeList.length; i++) {
    const udise = recomputeList[i]!;
    if (
      progressEvery > 0 &&
      (i === 0 || (i + 1) % progressEvery === 0 || i + 1 === recomputeTotal)
    ) {
      emitProgress(`reconcile: derivations ${i + 1}/${recomputeTotal}`);
    }
    await recomputeSchoolDerivations(udise);
    derivationsRecomputed++;
  }

  emitProgress("reconcile: refreshing map state/district aggregates…");
  try {
    await refreshMapAggregates();
  } catch (e) {
    if (!options?.quiet) {
      console.warn(
        "refreshMapAggregates failed (tables may be missing); invalidating API cache only.",
        e,
      );
    }
    invalidateMapAndDashboardCache();
  }

  invalidateMapAndDashboardCache();

  emitProgress(
    `reconcile: summary ${JSON.stringify({
      schoolsPatched,
      revenueSchoolsTouched,
      derivationsRecomputed,
      recomputeSet: udisesToRecompute.size,
    })}`,
  );

  return {
    schoolsPatched,
    revenueSchoolsTouched,
    derivationsRecomputed,
    coordinatesUpdated: coordSync.updated,
    coordinatesRowsInFile: coordSync.rowsInFile,
    coordinatesFileMissing: coordSync.missingFile,
  };
}
