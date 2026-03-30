/** Pure aggregation for map rollups and live queries (no Prisma). */
import { normalizeStateLabel } from "../../shared/geo-normalize.js";
import { canonicalizeStateDisplay } from "../../shared/geo-normalize.js";

export type SchoolMapRow = {
  udise: string;
  geographicState: string | null;
  /** Scrape / schools.json state label when geographicState from PDF is missing. */
  apiStateName: string | null;
  geographicDistrict: string | null;
  totalStudents: number | null;
  profileCompletenessPct: number | null;
  parsingStatus: string;
  state: {
    regionId: string | null;
    region: { id: string; name: string; code: string } | null;
  } | null;
};

/** Heuristic: some PDFs mis-parse body text as "state" — prefer scrape `apiStateName` then. */
export function isCorruptExtractedStateLabel(g: string | null | undefined): boolean {
  if (!g?.trim()) return true;
  const s = g.trim();
  if (s.length > 48) return true;
  if (
    /availability|ramp|affiliation|board|special school|cwsn|handrail|functional toilets|navodaya|vidyalaya|samiti|nvs\b/i.test(
      s,
    )
  )
    return true;
  return false;
}

/** Canonical key for state grouping (case-insensitive). */
export function stateLabelKey(raw: string): string {
  return normalizeStateLabel(raw);
}

/** Single source for map + dashboard state buckets (sound PDF geo beats scrape metadata). */
export function effectiveDisplayState(s: Pick<SchoolMapRow, "geographicState" | "apiStateName">): string {
  const g = s.geographicState?.trim();
  const a = s.apiStateName?.trim();
  const geo = isCorruptExtractedStateLabel(g) ? null : g;
  const base = geo || a || "Unknown";
  return base === "Unknown" ? base : (canonicalizeStateDisplay(base) ?? "Unknown");
}

export function aggregateSchools(schools: SchoolMapRow[]) {
  const byState = new Map<
    string,
    {
      count: number;
      students: number;
      districts: Set<string>;
      readinessSum: number;
      readinessN: number;
      completed: number;
    }
  >();
  const byRegion = new Map<
    string,
    {
      count: number;
      students: number;
      readinessSum: number;
      readinessN: number;
    }
  >();

  for (const s of schools) {
    const st = effectiveDisplayState(s);
    if (!byState.has(st)) {
      byState.set(st, {
        count: 0,
        students: 0,
        districts: new Set(),
        readinessSum: 0,
        readinessN: 0,
        completed: 0,
      });
    }
    const agg = byState.get(st)!;
    agg.count++;
    agg.students += s.totalStudents ?? 0;
    if (s.geographicDistrict) agg.districts.add(s.geographicDistrict);
    if (s.profileCompletenessPct != null) {
      agg.readinessSum += s.profileCompletenessPct;
      agg.readinessN++;
    }
    if (s.parsingStatus === "COMPLETE") agg.completed++;

    const rid = s.state?.region?.id || s.state?.regionId || "unassigned";
    const rname = s.state?.region?.name || "Unassigned";
    const key = `${rid}::${rname}`;
    if (!byRegion.has(key)) {
      byRegion.set(key, { count: 0, students: 0, readinessSum: 0, readinessN: 0 });
    }
    const r = byRegion.get(key)!;
    r.count++;
    r.students += s.totalStudents ?? 0;
    if (s.profileCompletenessPct != null) {
      r.readinessSum += s.profileCompletenessPct;
      r.readinessN++;
    }
  }

  const states = [...byState.entries()].map(([name, v]) => ({
    name,
    schoolCount: v.count,
    studentSum: v.students,
    districtCount: v.districts.size,
    readinessSum: v.readinessSum,
    readinessN: v.readinessN,
    avgReadiness: v.readinessN > 0 ? Math.round((v.readinessSum / v.readinessN) * 10) / 10 : null,
    completedCount: v.completed,
  }));

  const maxStateSchoolCount = states.reduce((m, s) => Math.max(m, s.schoolCount), 0);
  const maxStateAvgReadiness = states.reduce((m, s) => {
    if (s.avgReadiness == null) return m;
    return Math.max(m, s.avgReadiness);
  }, 0);

  const regions = [...byRegion.entries()].map(([key, v]) => {
    const [, name] = key.split("::");
    return {
      name,
      schoolCount: v.count,
      studentSum: v.students,
      avgReadiness: v.readinessN > 0 ? Math.round((v.readinessSum / v.readinessN) * 10) / 10 : null,
    };
  });

  return {
    states,
    regions,
    totalSchools: schools.length,
    maxStateSchoolCount,
    maxStateAvgReadiness: maxStateAvgReadiness || 100,
  };
}
