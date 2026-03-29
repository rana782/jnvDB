import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../lib/api";
import { fast, normal, slow } from "../lib/animationConfig";
import type {
  MapAgg,
  MapDistrictResponse,
  MapAggState,
  SchoolListResponse,
  DeploymentStrategyResponse,
  DashboardProgress,
} from "../types/school-api";
import type { MapHoverState } from "../components/map/IndiaMapCanvas";
import { useShellOutlet } from "../layout/ShellContext";

const IndiaMapCanvas = lazy(() =>
  import("../components/map/IndiaMapCanvas").then((m) => ({ default: m.IndiaMapCanvas })),
);

const MAP_MIN_READINESS = 75;
const MAP_MIN_STUDENTS = 350;
const FILTER_DEBOUNCE_MS = 320;
const LIST_ROW_ESTIMATE = 76;

type MapViewFilters = {
  highReadiness: boolean;
  highStudentCount: boolean;
  completedOnly: boolean;
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function readFiltersFromParams(sp: URLSearchParams): MapViewFilters {
  return {
    highReadiness: sp.get("highReadiness") === "true",
    highStudentCount: sp.get("highStudentCount") === "true",
    completedOnly: sp.get("completedOnly") === "true",
  };
}

function buildMapQueryString(colorBy: "jnv_count" | "readiness", f: MapViewFilters): string {
  const p = new URLSearchParams();
  if (colorBy !== "jnv_count") p.set("colorBy", colorBy);
  if (f.highReadiness) {
    p.set("highReadiness", "true");
    p.set("minReadinessPct", String(MAP_MIN_READINESS));
  }
  if (f.highStudentCount) {
    p.set("highStudentCount", "true");
    p.set("minStudentHeadcount", String(MAP_MIN_STUDENTS));
  }
  if (f.completedOnly) p.set("completedOnly", "true");
  return p.toString();
}

function schoolsListHref(state: string, district: string | null, f: MapViewFilters): string {
  const p = new URLSearchParams();
  p.set("state", state);
  if (district) p.set("district", district);
  if (f.highReadiness) p.set("minCompleteness", String(MAP_MIN_READINESS));
  if (f.highStudentCount) p.set("minStudents", String(MAP_MIN_STUDENTS));
  if (f.completedOnly) p.set("parsingStatus", "COMPLETE");
  p.set("page", "1");
  return `/schools?${p.toString()}`;
}

function buildSchoolsApiQs(state: string, district: string, f: MapViewFilters): string {
  const p = new URLSearchParams();
  p.set("page", "1");
  p.set("pageSize", "100");
  p.set("state", state);
  p.set("district", district);
  if (f.highReadiness) p.set("minCompleteness", String(MAP_MIN_READINESS));
  if (f.highStudentCount) p.set("minStudents", String(MAP_MIN_STUDENTS));
  if (f.completedOnly) p.set("parsingStatus", "COMPLETE");
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

async function loadDistricts(state: string, qs: string): Promise<MapDistrictResponse> {
  const p = new URLSearchParams(qs);
  p.set("state", state);
  return apiJson<MapDistrictResponse>(`/api/dashboard/map/districts?${p.toString()}`);
}

async function loadSchools(qs: string): Promise<SchoolListResponse> {
  return apiJson<SchoolListResponse>(`/api/schools?${qs}`);
}

async function loadDeploymentSummary(qs: string): Promise<DeploymentStrategyResponse> {
  const suffix = qs.length ? `?${qs}` : "";
  return apiJson<DeploymentStrategyResponse>(`/api/dashboard/deployment${suffix}`);
}

function formatInrShort(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n).toLocaleString()}`;
}

export function MapPage() {
  const { setBreadcrumb } = useShellOutlet();
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const [sp, setSp] = useSearchParams();
  const [hover, setHover] = useState<MapHoverState>(null);

  const selectedState = sp.get("state")?.trim() || null;
  const selectedDistrict = sp.get("district")?.trim() || null;
  const selectedSchoolUdise = sp.get("school")?.trim() || null;
  const colorBy = sp.get("colorBy") === "readiness" ? "readiness" : "jnv_count";

  const filterSig = `${sp.get("highReadiness")}|${sp.get("highStudentCount")}|${sp.get("completedOnly")}`;
  const [filterDraft, setFilterDraft] = useState<MapViewFilters>(() => readFiltersFromParams(sp));

  useEffect(() => {
    setFilterDraft((prev) => {
      const next = readFiltersFromParams(sp);
      if (
        prev.highReadiness === next.highReadiness &&
        prev.highStudentCount === next.highStudentCount &&
        prev.completedOnly === next.completedOnly
      ) {
        return prev;
      }
      return next;
    });
  }, [filterSig, sp]);

  const debouncedFilters = useDebouncedValue(filterDraft, FILTER_DEBOUNCE_MS);

  useEffect(() => {
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (debouncedFilters.highReadiness) {
          n.set("highReadiness", "true");
          n.set("minReadinessPct", String(MAP_MIN_READINESS));
        } else {
          n.delete("highReadiness");
          n.delete("minReadinessPct");
        }
        if (debouncedFilters.highStudentCount) {
          n.set("highStudentCount", "true");
          n.set("minStudentHeadcount", String(MAP_MIN_STUDENTS));
        } else {
          n.delete("highStudentCount");
          n.delete("minStudentHeadcount");
        }
        if (debouncedFilters.completedOnly) n.set("completedOnly", "true");
        else n.delete("completedOnly");
        return n;
      },
      { replace: true },
    );
  }, [debouncedFilters, setSp]);

  const mapQs = useMemo(
    () => buildMapQueryString(colorBy, debouncedFilters),
    [colorBy, debouncedFilters],
  );

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

  const districtsQ = useQuery({
    queryKey: ["map-districts", selectedState ?? "", mapQs],
    queryFn: () => loadDistricts(selectedState!, mapQs),
    enabled: Boolean(selectedState),
    staleTime: 60_000,
    gcTime: 600_000,
  });

  const schoolsQs = useMemo(() => {
    if (!selectedState || !selectedDistrict) return "";
    return buildSchoolsApiQs(selectedState, selectedDistrict, debouncedFilters);
  }, [selectedState, selectedDistrict, debouncedFilters]);

  const schoolsQ = useQuery({
    queryKey: ["map-schools", schoolsQs],
    queryFn: () => loadSchools(schoolsQs),
    enabled: Boolean(schoolsQs),
    staleTime: 30_000,
    gcTime: 300_000,
    placeholderData: keepPreviousData,
  });

  const depRevenueQs = useMemo(() => "topLimit=100", []);
  const depRevenue = useQuery({
    queryKey: ["deployment-revenue-map", depRevenueQs],
    queryFn: () => loadDeploymentSummary(depRevenueQs),
    staleTime: 120_000,
  });

  const bottomDepQs = useMemo(() => {
    const p = new URLSearchParams({ topLimit: "15" });
    if (selectedState) p.set("state", selectedState);
    return p.toString();
  }, [selectedState]);

  const bottomDeploy = useQuery({
    queryKey: ["deployment-bottom-cards", bottomDepQs],
    queryFn: () => loadDeploymentSummary(bottomDepQs),
    staleTime: 60_000,
  });

  const progressQ = useQuery({
    queryKey: ["dashboard-progress"],
    queryFn: () => apiJson<DashboardProgress>("/api/dashboard/progress"),
    staleTime: 60_000,
  });

  const stateRevenueByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of depRevenue.data?.stateRevenueSummary ?? []) {
      m.set(r.state, r.monthlyRevenueSum);
    }
    return m;
  }, [depRevenue.data]);

  const stateByName = useMemo(() => {
    const m = new Map<string, MapAggState>(map.data?.states.map((s) => [s.name, s]) ?? []);
    return m;
  }, [map.data?.states]);

  const maxCount = map.data?.meta.maxStateSchoolCount ?? 1;
  const maxRead = map.data?.meta.maxStateAvgReadiness ?? 100;

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

  const setColorBy = useCallback(
    (c: "jnv_count" | "readiness") => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (c === "readiness") n.set("colorBy", "readiness");
          else n.delete("colorBy");
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const toggleFilter = (key: keyof MapViewFilters) => {
    setFilterDraft((f) => ({ ...f, [key]: !f[key] }));
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
  };

  const onToggleStateGeo = useCallback(
    (geoName: string) => {
      setStateNav(selectedState === geoName ? null : geoName);
    },
    [selectedState, setStateNav],
  );

  const districtsList = districtsQ.data?.districts ?? [];
  const schoolItems = schoolsQ.data?.items ?? [];
  const topDistricts = useMemo(() => {
    return [...districtsList].sort((a, b) => b.schoolCount - a.schoolCount).slice(0, 5);
  }, [districtsList]);

  const stateRow = useMemo(() => {
    if (!selectedState) return null;
    return stateByName.get(selectedState) ?? null;
  }, [selectedState, stateByName]);

  const stateMonthlyRev = selectedState ? stateRevenueByName.get(selectedState) ?? 0 : 0;
  const portfolioMonthlyRev = useMemo(
    () => (depRevenue.data?.stateRevenueSummary ?? []).reduce((a, r) => a + r.monthlyRevenueSum, 0),
    [depRevenue.data],
  );

  const totalStudentsInView = useMemo(
    () => map.data?.states.reduce((a, s) => a + s.studentSum, 0) ?? 0,
    [map.data],
  );

  const selectedSchoolRow = useMemo(
    () => schoolItems.find((s) => s.udise === selectedSchoolUdise) ?? null,
    [schoolItems, selectedSchoolUdise],
  );

  const schoolsParentRef = useRef<HTMLDivElement>(null);

  const schoolsVirtual = useVirtualizer({
    count: schoolItems.length,
    getScrollElement: () => schoolsParentRef.current,
    estimateSize: () => LIST_ROW_ESTIMATE,
    overscan: 12,
  });

  const filtersPending =
    filterDraft.highReadiness !== debouncedFilters.highReadiness ||
    filterDraft.highStudentCount !== debouncedFilters.highStudentCount ||
    filterDraft.completedOnly !== debouncedFilters.completedOnly;

  useEffect(() => {
    const sep = <span className="mx-1.5 text-[#94a3b8]">/</span>;
    const nodes: ReactNode[] = [
      <button
        key="in"
        type="button"
        className="text-[#2563EB] transition-colors duration-100 hover:underline"
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
          className="text-[#2563EB] transition-colors duration-100 hover:underline"
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
        <div className="flex min-h-0 min-w-0 flex-[7] flex-col border-b border-[#E2E8F0] lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#E2E8F0] bg-white px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
              <span>Color</span>
              <label className="flex cursor-pointer items-center gap-1 text-[#0F172A]">
                <input
                  type="radio"
                  name="colorBy"
                  checked={colorBy === "jnv_count"}
                  onChange={() => setColorBy("jnv_count")}
                />
                JNVs
              </label>
              <label className="flex cursor-pointer items-center gap-1 text-[#0F172A]">
                <input
                  type="radio"
                  name="colorBy"
                  checked={colorBy === "readiness"}
                  onChange={() => setColorBy("readiness")}
                />
                Readiness
              </label>
            </div>
            <div className="h-4 w-px bg-[#E2E8F0]" />
            <div className="flex flex-wrap gap-3 text-xs text-[#0F172A]">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filterDraft.highReadiness}
                  onChange={() => toggleFilter("highReadiness")}
                />
                High readiness
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filterDraft.highStudentCount}
                  onChange={() => toggleFilter("highStudentCount")}
                />
                High enrolment
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filterDraft.completedOnly}
                  onChange={() => toggleFilter("completedOnly")}
                />
                Parsed
              </label>
            </div>
            {map.data ? (
              <span className="ml-auto text-[11px] text-[#94a3b8]">
                {map.data.meta.totalSchools} schools{filtersPending ? " · …" : ""}
              </span>
            ) : null}
          </div>

          <motion.div
            ref={mapWrapRef}
            className="relative min-h-[280px] flex-1 bg-[#F1F5F9] p-2 lg:min-h-0"
            initial={false}
            animate={{ scale: selectedState ? 1.02 : 1 }}
            transition={slow}
          >
            <div className="h-full min-h-[260px] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm lg:min-h-0">
              <Suspense
                fallback={
                  <div className="flex h-full min-h-[240px] items-center justify-center text-[#64748B]">
                    Loading map…
                  </div>
                }
              >
                <IndiaMapCanvas
                  geo={geo.data}
                  stateByName={stateByName}
                  stateRevenueByName={stateRevenueByName}
                  colorBy={colorBy}
                  maxCount={maxCount}
                  maxReadiness={maxRead}
                  selectedState={selectedState}
                  mapWrapRef={mapWrapRef}
                  hover={hover}
                  setHover={setHover}
                  onToggleState={onToggleStateGeo}
                />
              </Suspense>
            </div>
          </motion.div>
        </div>

        <motion.aside
          className="flex w-full shrink-0 flex-col border-t border-[#E2E8F0] bg-white lg:w-[360px] lg:border-l lg:border-t-0"
          initial={{ x: 48, opacity: 0.92 }}
          animate={{ x: 0, opacity: 1 }}
          transition={normal}
        >
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#0F172A]">Insight</h2>
              {selectedState ? (
                <Link
                  className="text-xs font-medium text-[#2563EB] transition-colors duration-100 hover:underline"
                  to={`/deployment?${new URLSearchParams({ state: selectedState }).toString()}`}
                >
                  Deployment →
                </Link>
              ) : (
                <Link className="text-xs text-[#2563EB] hover:underline" to="/deployment">
                  Portfolio
                </Link>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
            <AnimatePresence mode="wait">
              <motion.div
                key={insightKey}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={normal}
              >
            {selectedSchoolRow && selectedState && selectedDistrict ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-[#64748B]">School</div>
                  <div className="mt-1 text-lg font-semibold text-[#0F172A]">{selectedSchoolRow.schoolName}</div>
                  <div className="mt-1 text-xs text-[#64748B]">
                    {selectedSchoolRow.totalStudents ?? "—"} students · Readiness{" "}
                    {selectedSchoolRow.profileCompletenessPct != null
                      ? `${selectedSchoolRow.profileCompletenessPct}%`
                      : "—"}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={fast}>
                  <Link
                    to={`/schools/${selectedSchoolRow.udise}`}
                    className="block rounded-lg bg-[#2563EB] py-2.5 text-center text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1d4ed8]"
                  >
                    View full dashboard
                  </Link>
                  </motion.div>
                  <p className="text-[11px] text-[#94a3b8]">
                    Mark pilot / pipeline on the school page (role-gated API).
                  </p>
                </div>
              </div>
            ) : selectedState && !selectedDistrict ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium uppercase text-[#64748B]">State</div>
                  <div className="mt-1 text-xl font-semibold text-[#0F172A]">{selectedState}</div>
                </div>
                {stateRow ? (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-[#F8FAFC] p-2">
                      <dt className="text-[11px] text-[#64748B]">JNVs</dt>
                      <dd className="font-semibold text-[#0F172A]">{stateRow.schoolCount}</dd>
                    </div>
                    <div className="rounded-lg bg-[#F8FAFC] p-2">
                      <dt className="text-[11px] text-[#64748B]">Students</dt>
                      <dd className="font-semibold text-[#0F172A]">{stateRow.studentSum.toLocaleString()}</dd>
                    </div>
                    <div className="rounded-lg bg-[#F8FAFC] p-2">
                      <dt className="text-[11px] text-[#64748B]">Avg readiness</dt>
                      <dd className="font-semibold text-[#0F172A]">
                        {stateRow.avgReadiness != null ? `${stateRow.avgReadiness}%` : "—"}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-[#F8FAFC] p-2">
                      <dt className="text-[11px] text-[#64748B]">Revenue (model)</dt>
                      <dd className="font-semibold text-[#10B981]">{formatInrShort(stateMonthlyRev)} / mo</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-[#64748B]">Loading…</p>
                )}
                <div>
                  <div className="text-xs font-medium text-[#64748B]">Top districts</div>
                  <ul className="mt-2 space-y-1">
                    {districtsQ.isPending ? (
                      <li className="text-[#94a3b8]">Loading…</li>
                    ) : (
                      topDistricts.map((d) => (
                        <li key={d.name}>
                          <button
                            type="button"
                            className="w-full rounded-md px-2 py-1.5 text-left text-[#0F172A] transition-colors duration-100 hover:bg-[#F8FAFC]"
                            onClick={() => setDistrictNav(d.name)}
                          >
                            {d.name}{" "}
                            <span className="text-[#64748B]">
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
                    className="text-xs text-[#2563EB] hover:underline"
                    onClick={() => setDistrictNav(null)}
                  >
                    ← {selectedState}
                  </button>
                </div>
                <div className="text-sm font-semibold text-[#0F172A]">{selectedDistrict}</div>
                {schoolsQ.isPending ? (
                  <p className="text-[#64748B]">Loading schools…</p>
                ) : schoolsQ.isError ? (
                  <p className="text-amber-700">Could not load schools.</p>
                ) : (
                  <div ref={schoolsParentRef} className="max-h-[min(50vh,420px)] overflow-y-auto">
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
                              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 ${
                                active
                                  ? "border-[#2563EB] bg-[#eff6ff]"
                                  : "border-transparent bg-[#F8FAFC] hover:border-[#E2E8F0]"
                              }`}
                            >
                              <div className="font-medium text-[#0F172A]">{s.schoolName}</div>
                              <div className="text-[11px] text-[#64748B]">
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
                  className="block text-center text-xs text-[#2563EB] hover:underline"
                  to={schoolsListHref(selectedState, selectedDistrict, debouncedFilters)}
                >
                  Open in Schools list →
                </Link>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-[#64748B]">
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
        className="flex h-auto min-h-[140px] shrink-0 flex-col border-t border-[#E2E8F0] bg-white shadow-[0_-4px_24px_rgba(15,23,42,0.06)]"
        initial={{ y: 80, opacity: 0.95 }}
        animate={{ y: 0, opacity: 1 }}
        transition={normal}
      >
        <div className="grid grid-cols-2 gap-px bg-[#E2E8F0] sm:grid-cols-4">
          {[
            { label: "Total JNV", value: map.data?.meta.totalSchools?.toLocaleString() ?? "—" },
            { label: "Students", value: totalStudentsInView.toLocaleString() },
            {
              label: "Revenue (model)",
              value: selectedState ? formatInrShort(stateMonthlyRev) : formatInrShort(portfolioMonthlyRev),
            },
            { label: "Pipeline DONE", value: `${donePct}%` },
          ].map((c) => (
            <div key={c.label} className="bg-white px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-[#64748B]">{c.label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-[#0F172A]">{c.value}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-[#E2E8F0] px-3 py-2">
          <div className="mb-1 text-[11px] font-medium uppercase text-[#64748B]">Priority schools (deployment score)</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {bottomDeploy.isPending ? (
              <span className="text-xs text-[#94a3b8]">Loading…</span>
            ) : (
              (bottomDeploy.data?.topSchools ?? []).map((s, i) => (
                <motion.div
                  key={s.udise}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...fast, delay: Math.min(i * 0.04, 0.2) }}
                  whileHover={{ y: -2, boxShadow: "0px 8px 24px rgba(15,23,42,0.08)" }}
                >
                <Link
                  to={`/schools/${s.udise}`}
                  className="block min-w-[160px] shrink-0 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 transition-colors duration-150 hover:border-[#2563EB]/40"
                >
                  <div className="truncate text-xs font-semibold text-[#0F172A]">{s.schoolName}</div>
                  <div className="mt-1 text-[10px] text-[#64748B]">
                    {s.priorityScore} · {s.geographicState ?? "—"}
                  </div>
                </Link>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
