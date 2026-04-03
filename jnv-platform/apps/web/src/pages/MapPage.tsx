import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiJson } from "../lib/api";
import { fast, normal, slow } from "../lib/animationConfig";
import type {
  MapAgg,
  MapDistrictResponse,
  MapAggState,
  SchoolListResponse,
  DashboardProgress,
} from "../types/school-api";
import type { MapHoverState } from "../components/map/IndiaMapCanvas";
import { useShellOutlet } from "../layout/ShellContext";

const IndiaMapCanvas = lazy(() =>
  import("../components/map/IndiaMapCanvas").then((m) => ({ default: m.IndiaMapCanvas })),
);

const LIST_ROW_ESTIMATE = 76;
type GeoStateMeta = {
  name: string;
  region: { name: string } | null;
};

function schoolsListHref(state: string, district: string | null): string {
  const p = new URLSearchParams();
  p.set("state", state);
  if (district) p.set("district", district);
  p.set("page", "1");
  return `/schools?${p.toString()}`;
}

function buildSchoolsApiQs(state: string, district: string): string {
  const p = new URLSearchParams();
  p.set("page", "1");
  p.set("pageSize", "100");
  p.set("state", state);
  p.set("district", district);
  return p.toString();
}

async function loadGeo() {
  const res = await fetch("/india-states.geojson");
  return res.json() as Promise<{ type: string; features: { properties: { name?: string } }[] }>;
}

async function loadMap(qs: string): Promise<MapAgg> {
  const suffix = qs.length ? `?${qs}` : "";
  return apiJson<MapAgg>(`/api/dashboard/map${suffix}`);
}

async function loadGeoStates(): Promise<GeoStateMeta[]> {
  return apiJson<GeoStateMeta[]>("/api/states");
}

async function loadDistricts(state: string, qs: string): Promise<MapDistrictResponse> {
  const p = new URLSearchParams(qs);
  p.set("state", state);
  return apiJson<MapDistrictResponse>(`/api/dashboard/map/districts?${p.toString()}`);
}

async function loadSchools(qs: string): Promise<SchoolListResponse> {
  return apiJson<SchoolListResponse>(`/api/schools?${qs}`);
}

async function loadAllStateSchools(state: string): Promise<SchoolListResponse> {
  const pageSize = 100;
  const all: SchoolListResponse["items"] = [];
  let page = 1;
  let total = 0;
  while (true) {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      state,
    }).toString();
    const res = await loadSchools(qs);
    total = res.total;
    all.push(...res.items);
    if (all.length >= total || res.items.length === 0) break;
    page += 1;
    if (page > 100) break;
  }
  return { items: all, total, page: 1, pageSize: all.length || pageSize };
}

function formatInrShort(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatInrShortMaybe(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatInrShort(n);
}

function normalizeDistrictLabel(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!d) return null;
  if (/region|office|samiti|headquarters|navodaya/i.test(d)) return null;
  if (d.length < 2) return null;
  return d;
}

export function MapPage() {
  const { setBreadcrumb } = useShellOutlet();
  const navigate = useNavigate();
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const [sp, setSp] = useSearchParams();
  const [hover, setHover] = useState<MapHoverState>(null);

  const selectedState = sp.get("state")?.trim() || null;
  const selectedDistrict = sp.get("district")?.trim() || null;
  const selectedSchoolUdise = sp.get("school")?.trim() || null;
  const mapQs = "";

  const geo = useQuery({
    queryKey: ["india-geo"],
    queryFn: loadGeo,
    staleTime: Infinity,
    gcTime: 86_400_000,
  });

  const map = useQuery({
    queryKey: ["map", mapQs],
    queryFn: () => loadMap(mapQs),
    staleTime: 60_000,
    gcTime: 600_000,
  });

  const geoStates = useQuery({
    queryKey: ["geo-states-meta"],
    queryFn: loadGeoStates,
    staleTime: 300_000,
    gcTime: 1_800_000,
  });

  const districtsQ = useQuery({
    queryKey: ["map-districts", selectedState ?? "", mapQs],
    queryFn: () => loadDistricts(selectedState!, mapQs),
    enabled: Boolean(selectedState),
    staleTime: 60_000,
    gcTime: 600_000,
  });

  const schoolsQs = useMemo(() => {
    if (!selectedState || !selectedDistrict) return "";
    return buildSchoolsApiQs(selectedState, selectedDistrict);
  }, [selectedState, selectedDistrict]);

  const schoolsQ = useQuery({
    queryKey: ["map-schools", schoolsQs],
    queryFn: () => loadSchools(schoolsQs),
    enabled: Boolean(schoolsQs),
    staleTime: 30_000,
    gcTime: 300_000,
    placeholderData: keepPreviousData,
  });

  const stateSchoolsQ = useQuery({
    queryKey: ["map-state-schools", selectedState ?? ""],
    queryFn: () => loadAllStateSchools(selectedState!),
    enabled: Boolean(selectedState),
    staleTime: 30_000,
    gcTime: 300_000,
    placeholderData: keepPreviousData,
  });

  const progressQ = useQuery({
    queryKey: ["dashboard-progress"],
    queryFn: () => apiJson<DashboardProgress>("/api/dashboard/progress"),
    staleTime: 60_000,
  });

  const stateRevenueByName = useMemo(() => new Map<string, number>(), []);

  const stateByName = useMemo(() => {
    const m = new Map<string, MapAggState>(map.data?.states.map((s) => [s.name, s]) ?? []);
    return m;
  }, [map.data?.states]);
  const stateRegionPairs = useMemo(
    () =>
      (geoStates.data ?? []).map((s) => ({
        stateName: s.name,
        regionName: s.region?.name ?? "",
      })),
    [geoStates.data],
  );

  const goIndia = useCallback(() => {
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("state");
        n.delete("district");
        n.delete("school");
        return n;
      },
      { replace: true },
    );
  }, [setSp]);

  const goStateOnly = useCallback(() => {
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("district");
        n.delete("school");
        return n;
      },
      { replace: true },
    );
  }, [setSp]);

  const setStateNav = useCallback(
    (name: string | null) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (name) {
            n.set("state", name);
          } else {
            n.delete("state");
            n.delete("district");
            n.delete("school");
          }
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const setDistrictNav = useCallback(
    (name: string | null) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (name) {
            n.set("district", name);
            n.delete("school");
          } else {
            n.delete("district");
            n.delete("school");
          }
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const setSchoolUdise = useCallback(
    (udise: string | null) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (udise) n.set("school", udise);
          else n.delete("school");
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const onMarkerClick = useCallback(
    (udise: string, district: string | null) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (district) n.set("district", district);
          n.set("school", udise);
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const onToggleStateGeo = useCallback(
    (geoName: string) => {
      setStateNav(selectedState === geoName ? null : geoName);
    },
    [selectedState, setStateNav],
  );

  const districtsList = districtsQ.data?.districts ?? [];
  const schoolItems = schoolsQ.data?.items ?? [];
  const stateSchoolItems = stateSchoolsQ.data?.items ?? [];
  const stateMarkers = useMemo(() => {
    if (!selectedState) return [];
    const rows = stateSchoolsQ.data?.items ?? [];
    return rows
      .filter((s) => typeof s.latitude === "number" && typeof s.longitude === "number")
      .map((s) => ({
        udise: s.udise,
        schoolName: s.schoolName,
        district: s.geographicDistrict ?? null,
        state: s.stateName ?? s.geographicState ?? selectedState,
        totalStudents: s.totalStudents ?? null,
        totalBoys: s.totalBoys ?? null,
        totalGirls: s.totalGirls ?? null,
        profileCompletenessPct: s.profileCompletenessPct ?? null,
        revenueByScenario: s.revenueByScenario,
        lat: s.latitude as number,
        lon: s.longitude as number,
      }));
  }, [selectedState, stateSchoolsQ.data?.items]);
  const topDistricts = useMemo(() => {
    if (!selectedState) return [] as { name: string; schoolCount: number; studentSum: number; topUdise: string | null }[];
    const byDistrict = new Map<string, { schoolCount: number; studentSum: number; topUdise: string | null; topStudents: number }>();
    for (const s of stateSchoolItems) {
      const district = normalizeDistrictLabel(s.geographicDistrict);
      if (!district) continue;
      const students = s.totalStudents ?? 0;
      const row = byDistrict.get(district) ?? {
        schoolCount: 0,
        studentSum: 0,
        topUdise: null,
        topStudents: -1,
      };
      row.schoolCount += 1;
      row.studentSum += students;
      if (students > row.topStudents) {
        row.topStudents = students;
        row.topUdise = s.udise;
      }
      byDistrict.set(district, row);
    }
    if (byDistrict.size > 0) {
      return [...byDistrict.entries()]
        .map(([name, r]) => ({ name, schoolCount: r.schoolCount, studentSum: r.studentSum, topUdise: r.topUdise }))
        .sort((a, b) => b.schoolCount - a.schoolCount || b.studentSum - a.studentSum || a.name.localeCompare(b.name))
        .slice(0, 5);
    }
    return [...districtsList]
      .filter((d) => normalizeDistrictLabel(d.name))
      .map((d) => ({ name: d.name, schoolCount: d.schoolCount, studentSum: d.studentSum, topUdise: null }))
      .sort((a, b) => b.schoolCount - a.schoolCount || b.studentSum - a.studentSum || a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [selectedState, stateSchoolItems, districtsList]);

  const stateRow = useMemo(() => {
    if (!selectedState) return null;
    return stateByName.get(selectedState) ?? null;
  }, [selectedState, stateByName]);

  const totalStudentsInView = useMemo(
    () => map.data?.states.reduce((a, s) => a + s.studentSum, 0) ?? 0,
    [map.data],
  );
  const selectedStateFooter = useMemo(() => {
    if (!selectedState) return null;
    const totalJnv = stateSchoolItems.length;
    const students = stateSchoolItems.reduce((a, s) => a + (s.totalStudents ?? 0), 0);
    const done = stateSchoolItems.reduce((a, s) => a + (String(s.pipelineStatus).toUpperCase() === "DONE" ? 1 : 0), 0);
    const donePct = totalJnv > 0 ? Math.round((done * 100) / totalJnv) : 0;
    return { totalJnv, students, donePct };
  }, [selectedState, stateSchoolItems]);

  const selectedSchoolRow = useMemo(() => {
    if (!selectedSchoolUdise) return null;
    return (
      schoolItems.find((s) => s.udise === selectedSchoolUdise) ??
      stateSchoolItems.find((s) => s.udise === selectedSchoolUdise) ??
      null
    );
  }, [schoolItems, stateSchoolItems, selectedSchoolUdise]);
  const selectedSchoolRevenue = useMemo(() => {
    if (!selectedSchoolRow) return null;
    return selectedSchoolRow.revenueByScenario;
  }, [selectedSchoolRow]);
  const selectedStateRevenue = useMemo(() => {
    const rows = stateSchoolItems;
    return rows.reduce(
      (acc, s) => {
        acc.low += s.revenueByScenario.low.monthly ?? 0;
        acc.medium += s.revenueByScenario.medium.monthly ?? 0;
        acc.high += s.revenueByScenario.high.monthly ?? 0;
        return acc;
      },
      { low: 0, medium: 0, high: 0 },
    );
  }, [stateSchoolItems]);

  const schoolsParentRef = useRef<HTMLDivElement>(null);

  const schoolsVirtual = useVirtualizer({
    count: schoolItems.length,
    getScrollElement: () => schoolsParentRef.current,
    estimateSize: () => LIST_ROW_ESTIMATE,
    overscan: 12,
  });

  useEffect(() => {
    const sep = <span className="mx-1.5 text-muted">/</span>;
    const nodes: ReactNode[] = [
      <button
        key="in"
        type="button"
        className="text-accent transition-colors duration-100 hover:underline"
        onClick={goIndia}
      >
        India
      </button>,
    ];
    if (selectedState) {
      nodes.push(
        sep,
        <button
          key="st"
          type="button"
          className="text-accent transition-colors duration-100 hover:underline"
          onClick={goStateOnly}
        >
          {selectedState}
        </button>,
      );
    }
    if (selectedDistrict) {
      nodes.push(sep, <span key="di">{selectedDistrict}</span>);
    }
    if (selectedSchoolRow) {
      nodes.push(sep, <span key="sc">{selectedSchoolRow.schoolName}</span>);
    }
    setBreadcrumb(<div className="flex flex-wrap items-center">{nodes}</div>);
    return () => setBreadcrumb(null);
  }, [selectedState, selectedDistrict, selectedSchoolRow, goIndia, goStateOnly, setBreadcrumb]);

  if (map.isError) {
    return (
      <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Could not load map aggregates from the API.
      </div>
    );
  }

  const donePct = progressQ.data?.pipelineDonePercent ?? 0;

  const insightKey = `${selectedState ?? ""}|${selectedDistrict ?? ""}|${selectedSchoolUdise ?? ""}`;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-[7] flex-col border-b border-line lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface-2/90 px-2.5 py-2.5 backdrop-blur sm:gap-3 sm:px-3">
            <div className="text-[11px] font-medium text-muted sm:text-xs">India state map</div>
            {map.data ? (
              <span className="ml-auto text-[10px] text-muted sm:text-[11px]">
                {map.data.meta.totalSchools} schools
              </span>
            ) : null}
          </div>

          <motion.div
            ref={mapWrapRef}
            className="relative min-h-[300px] flex-1 bg-canvas p-0 lg:min-h-0"
            initial={false}
            animate={{ scale: 1 }}
            transition={slow}
          >
            <div className="h-full min-h-[280px] overflow-hidden rounded-none border border-line bg-surface-1 shadow-premium lg:min-h-0">
              {selectedState ? (
                <button
                  type="button"
                  className="absolute left-3 top-3 z-20 rounded-md border border-line bg-surface-2/95 px-3 py-2 text-sm font-medium text-ink shadow-premium hover:bg-surface-3 sm:text-xs"
                  onClick={goIndia}
                >
                  Back to India
                </button>
              ) : null}
              <Suspense
                fallback={
                  <div className="flex h-full min-h-[240px] items-center justify-center text-muted">
                    Loading map…
                  </div>
                }
              >
                <IndiaMapCanvas
                  geo={geo.data}
                  stateByName={stateByName}
                  stateRevenueByName={stateRevenueByName}
                  selectedState={selectedState}
                  selectedSchoolUdise={selectedSchoolUdise}
                  schoolMarkers={stateMarkers}
                  stateRegionPairs={stateRegionPairs}
                  mapWrapRef={mapWrapRef}
                  hover={hover}
                  setHover={setHover}
                  onToggleState={onToggleStateGeo}
                  onMarkerClick={onMarkerClick}
                />
              </Suspense>
            </div>
          </motion.div>
        </div>

        <motion.aside
          className="flex w-full shrink-0 flex-col border-t border-line bg-surface-2 lg:w-[360px] lg:border-l lg:border-t-0"
          initial={{ x: 48, opacity: 0.92 }}
          animate={{ x: 0, opacity: 1 }}
          transition={normal}
        >
          <div className="border-b border-line px-3 py-3 sm:px-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink sm:text-base">Insight</h2>
              <Link className="text-[11px] text-accent hover:underline sm:text-xs" to="/schools">
                Schools
              </Link>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-xs sm:px-4 sm:text-sm">
            <AnimatePresence mode="wait">
              <motion.div
                key={insightKey}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={normal}
              >
            {selectedSchoolRow && selectedState ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted">School</div>
                  <div className="mt-1 text-base font-semibold text-ink sm:text-lg">{selectedSchoolRow.schoolName}</div>
                  <div className="mt-1 text-[11px] text-muted sm:text-xs">
                    {selectedSchoolRow.totalStudents ?? "—"} students
                  </div>
                  <div className="mt-1 text-[11px] font-medium sm:text-xs">
                    <span className="text-emerald-700">Low {formatInrShortMaybe(selectedSchoolRevenue?.low.monthly)}</span>{" · "}
                    <span className="text-yellow-700">Medium {formatInrShortMaybe(selectedSchoolRevenue?.medium.monthly)}</span>{" · "}
                    <span className="text-rose-800">High {formatInrShortMaybe(selectedSchoolRevenue?.high.monthly)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={fast}>
                  <Link
                    to={`/schools/${selectedSchoolRow.udise}`}
                    className="block rounded-lg bg-accent py-2.5 text-center text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
                  >
                    View full dashboard
                  </Link>
                  </motion.div>
                  <p className="text-[10px] text-muted sm:text-[11px]">
                    Mark pilot / pipeline on the school page (role-gated API).
                  </p>
                </div>
              </div>
            ) : selectedState && !selectedDistrict ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium uppercase text-muted">State</div>
                  <div className="mt-1 text-lg font-semibold text-ink sm:text-xl">{selectedState}</div>
                </div>
                {stateRow ? (
                  <dl className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                    <div className="rounded-lg border border-line bg-surface-3 p-2">
                      <dt className="text-[10px] text-muted sm:text-[11px]">JNVs</dt>
                      <dd className="font-semibold text-ink">{stateRow.schoolCount}</dd>
                    </div>
                    <div className="rounded-lg border border-line bg-surface-3 p-2">
                      <dt className="text-[10px] text-muted sm:text-[11px]">Students</dt>
                      <dd className="font-semibold text-ink">{stateRow.studentSum.toLocaleString()}</dd>
                    </div>
                    <div className="rounded-lg border border-line bg-surface-3 p-2">
                      <dt className="text-[10px] text-muted sm:text-[11px]">Revenue (model)</dt>
                      <dd className="space-y-0.5 text-[10px] font-semibold sm:text-[11px]">
                        <div className="text-emerald-700">L: {formatInrShort(selectedStateRevenue.low)}/mo</div>
                        <div className="text-yellow-700">M: {formatInrShort(selectedStateRevenue.medium)}/mo</div>
                        <div className="text-rose-800">H: {formatInrShort(selectedStateRevenue.high)}/mo</div>
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-muted">Loading…</p>
                )}
                <div>
                  <div className="text-[11px] font-medium text-muted sm:text-xs">Top districts</div>
                  <ul className="mt-2 space-y-1">
                    {districtsQ.isPending ? (
                    <li className="text-muted">Loading…</li>
                    ) : (
                      topDistricts.map((d) => (
                        <li key={d.name}>
                          <button
                            type="button"
                            className="w-full rounded-md px-2 py-2.5 text-left text-ink transition-colors duration-100 hover:bg-surface-3 sm:py-1.5"
                            onClick={() => {
                              if (d.topUdise) {
                                navigate(`/schools/${d.topUdise}`);
                                return;
                              }
                              setDistrictNav(d.name);
                            }}
                          >
                            {d.name}{" "}
                            <span className="text-muted">
                              ({d.schoolCount} · {d.studentSum.toLocaleString()})
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            ) : selectedState && selectedDistrict ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline"
                    onClick={() => setDistrictNav(null)}
                  >
                    ← {selectedState}
                  </button>
                </div>
                <div className="text-sm font-semibold text-ink">{selectedDistrict}</div>
                {schoolsQ.isPending ? (
                  <p className="text-muted">Loading schools…</p>
                ) : schoolsQ.isError ? (
                  <p className="text-amber-700">Could not load schools.</p>
                ) : (
                  <div ref={schoolsParentRef} className="max-h-[min(52vh,430px)] overflow-y-auto sm:max-h-[min(55vh,460px)]">
                    <div className="relative" style={{ height: `${schoolsVirtual.getTotalSize()}px` }}>
                      {schoolsVirtual.getVirtualItems().map((vi) => {
                        const s = schoolItems[vi.index];
                        if (!s) return null;
                        const active = selectedSchoolUdise === s.udise;
                        return (
                          <div
                            key={s.udise}
                            className="absolute left-0 top-0 w-full py-0.5 pl-0 pr-0"
                            style={{ transform: `translateY(${vi.start}px)` }}
                          >
                            <button
                              type="button"
                              onClick={() => setSchoolUdise(s.udise)}
                              className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors duration-150 sm:py-2 ${
                                active
                                  ? "border-accent bg-accent/20"
                                  : "border-transparent bg-surface-3 hover:border-line"
                              }`}
                            >
                              <div className="font-medium text-ink">{s.schoolName}</div>
                              <div className="text-[10px] text-muted sm:text-[11px]">
                                {s.totalStudents ?? "—"} st. ·{" "}
                                {s.profileCompletenessPct != null ? `${s.profileCompletenessPct}%` : "—"} ready
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <Link
                  className="block text-center text-xs text-accent hover:underline"
                  to={schoolsListHref(selectedState, selectedDistrict)}
                >
                  Open in Schools list →
                </Link>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted">
                Click a state to zoom the selection. Pick a district, then a school for quick facts — or open the full
                record.
              </p>
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.aside>
      </div>

      <motion.footer
        className="flex h-auto min-h-[120px] shrink-0 flex-col border-t border-line bg-surface-2 shadow-premium sm:min-h-[140px]"
        initial={{ y: 80, opacity: 0.95 }}
        animate={{ y: 0, opacity: 1 }}
        transition={normal}
      >
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {[
            {
              label: "Total JNV",
              value: (selectedStateFooter?.totalJnv ?? map.data?.meta.totalSchools ?? 0).toLocaleString("en-IN"),
            },
            {
              label: "Students",
              value: (selectedStateFooter?.students ?? totalStudentsInView).toLocaleString("en-IN"),
            },
            { label: "Selected state", value: selectedState ?? "India" },
            { label: "Pipeline DONE", value: `${selectedStateFooter?.donePct ?? donePct}%` },
          ].map((c) => (
            <div key={c.label} className="bg-surface-2 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted sm:text-[11px]">{c.label}</div>
              <div className="mt-1 text-base font-semibold tabular-nums text-ink sm:text-lg">{c.value}</div>
            </div>
          ))}
        </div>
      </motion.footer>
    </div>
  );
}
