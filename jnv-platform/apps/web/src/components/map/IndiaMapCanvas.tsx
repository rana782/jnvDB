import type { MouseEvent } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { geoMercator } from "d3-geo";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import type { MapAggState } from "../../types/school-api";
import { fast, normal } from "../../lib/animationConfig";

const MotionGeography = motion(Geography);

export type MapHoverState = {
  name: string;
  x: number;
  y: number;
  schoolCount: number;
  studentSum: number;
  avgReadiness: number | null;
  completedCount: number;
  revenueLowMonthly: number | null;
  revenueMediumMonthly: number | null;
  revenueHighMonthly: number | null;
} | null;

type MarkerHoverState = {
  x: number;
  y: number;
  school: {
    udise: string;
    schoolName: string;
    district: string | null;
    state: string;
    totalStudents: number | null;
    totalBoys: number | null;
    totalGirls: number | null;
    revenueByScenario: {
      low: { monthly: number | null; annual: number | null };
      medium: { monthly: number | null; annual: number | null };
      high: { monthly: number | null; annual: number | null };
    };
    profileCompletenessPct: number | null;
  };
} | null;

export type IndiaGeoJson = {
  type: string;
  features: {
    geometry?: { type?: string; coordinates?: unknown };
    properties: {
      name?: string;
      NAME_1?: string;
      st_nm?: string;
      STATE?: string;
      STATE_NAME?: string;
    };
  }[];
};

function normalizeStateKey(v: string): string {
  return v
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z]/g, "");
}

function geoStateName(props: IndiaGeoJson["features"][number]["properties"]): string {
  return String(props.name ?? props.NAME_1 ?? props.st_nm ?? props.STATE ?? props.STATE_NAME ?? "").trim();
}

function canonicalStateNameFromGeo(
  geoName: string,
  stateByName: Map<string, MapAggState>,
): string {
  if (stateByName.has(geoName)) return geoName;
  const norm = normalizeStateKey(geoName);
  for (const apiName of stateByName.keys()) {
    if (normalizeStateKey(apiName) === norm) return apiName;
  }
  // Common alias drift between GeoJSON and API labels.
  if (norm === "andamanandnicobar" || norm === "andamanandnicobarislands") return "Andaman & Nicobar";
  if (norm === "dadraandnagarhavelianddamananddiu" || norm === "dadranagarhavelidamananddiu") {
    return "Dadra,Nagar Haveli,Daman & Diu";
  }
  if (norm === "orissa") return "Odisha";
  if (norm === "uttaranchal") return "Uttarakhand";
  if (norm === "jammuandkashmir") return "Jammu & Kashmir";
  return geoName;
}

const STATE_PALETTE = [
  "#2563EB",
  "#059669",
  "#DC2626",
  "#7C3AED",
  "#EA580C",
  "#0284C7",
  "#BE185D",
  "#65A30D",
  "#0D9488",
  "#4F46E5",
];

function colorForState(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return STATE_PALETTE[h % STATE_PALETTE.length]!;
}

function stateFill(
  stateName: string,
  stats: Pick<MapAggState, "schoolCount"> | undefined,
  selected: boolean,
): string {
  if (selected) return "#4B63E6";
  if (!stats || stats.schoolCount === 0) return "#1B2A4D";
  return colorForState(stateName);
}

function markerLocationLabel(district: string | null | undefined, schoolName: string): string {
  const d = (district ?? "").replace(/\s+/g, " ").trim();
  if (d.length >= 2) return d.length > 24 ? `${d.slice(0, 22)}…` : d;
  const tail = schoolName.replace(/^jawahar\s+navodaya\s+vidyalaya\s*,?\s*/i, "").trim();
  if (tail.length >= 2) {
    const parts = tail
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const pick = parts.length > 0 ? (parts[parts.length - 1] ?? tail) : tail;
    if (pick.length >= 2 && !/^\d{11}$/.test(pick)) return pick.length > 24 ? `${pick.slice(0, 22)}…` : pick;
  }
  return "—";
}

type Props = {
  geo: IndiaGeoJson | undefined;
  stateByName: Map<string, MapAggState>;
  selectedState: string | null;
  selectedSchoolUdise: string | null;
  schoolMarkers: {
    udise: string;
    schoolName: string;
    district: string | null;
    state: string;
    totalStudents: number | null;
    totalBoys: number | null;
    totalGirls: number | null;
    revenueByScenario: {
      low: { monthly: number | null; annual: number | null };
      medium: { monthly: number | null; annual: number | null };
      high: { monthly: number | null; annual: number | null };
    };
    profileCompletenessPct: number | null;
    lat: number;
    lon: number;
  }[];
  stateRegionPairs: { stateName: string; regionName: string }[];
  mapWrapRef: React.RefObject<HTMLDivElement | null>;
  hover: MapHoverState;
  setHover: (h: MapHoverState) => void;
  onToggleState: (geoName: string) => void;
  onMarkerClick: (udise: string, district: string | null) => void;
};

function flattenLonLat(coords: unknown, out: [number, number][]) {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    out.push([coords[0], coords[1]]);
    return;
  }
  for (const c of coords) flattenLonLat(c, out);
}

function bboxFromFeature(feature: IndiaGeoJson["features"][number]): [number, number, number, number] | null {
  const pts: [number, number][] = [];
  flattenLonLat(feature.geometry?.coordinates, pts);
  if (!pts.length) return null;
  let minX = pts[0]![0];
  let maxX = pts[0]![0];
  let minY = pts[0]![1];
  let maxY = pts[0]![1];
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, maxX, minY, maxY];
}

function projectionForState(
  geo: IndiaGeoJson,
  selectedState: string | null,
  stateByName: Map<string, MapAggState>,
): { center: [number, number]; scale: number } {
  if (!selectedState) return { center: [82, 22.5], scale: 1000 };
  const f = geo.features.find((g) => {
    const display = geoStateName(g.properties);
    const canonical = canonicalStateNameFromGeo(display, stateByName);
    return canonical === selectedState;
  });
  if (!f) return { center: [82, 22.5], scale: 1000 };
  const bbox = bboxFromFeature(f);
  if (!bbox) return { center: [82, 22.5], scale: 1000 };
  const [minX, maxX, minY, maxY] = bbox;
  const center: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const width = Math.max(0.5, maxX - minX);
  const height = Math.max(0.5, maxY - minY);
  const span = Math.max(width, height);
  const scale = Math.max(1800, Math.min(9000, 22000 / span));
  return { center, scale };
}

function placeLabels(
  pts: { id: string; x: number; y: number }[],
  minDx: number,
  minDy: number,
  maxCount: number,
): Set<string> {
  const accepted: { id: string; x: number; y: number }[] = [];
  for (const p of pts) {
    if (accepted.length >= maxCount) break;
    const clash = accepted.some((a) => Math.abs(a.x - p.x) < minDx && Math.abs(a.y - p.y) < minDy);
    if (!clash) accepted.push(p);
  }
  return new Set(accepted.map((a) => a.id));
}

function IndiaMapCanvasInner({
  geo,
  stateByName,
  selectedState,
  selectedSchoolUdise,
  schoolMarkers,
  stateRegionPairs,
  mapWrapRef,
  hover,
  setHover,
  onToggleState,
  onMarkerClick,
}: Props) {
  const [markerHover, setMarkerHover] = useState<MarkerHoverState>(null);
  const safeGeo: IndiaGeoJson = geo ?? { type: "FeatureCollection", features: [] };
  const onGeoMouseMove = useCallback(
    (e: MouseEvent, geoName: string) => {
      const box = mapWrapRef.current?.getBoundingClientRect();
      if (!box) return;
      const s = stateByName.get(geoName);
      setHover({
        name: geoName,
        x: e.clientX - box.left,
        y: e.clientY - box.top,
        schoolCount: s?.schoolCount ?? 0,
        studentSum: s?.studentSum ?? 0,
        avgReadiness: s?.avgReadiness ?? null,
        completedCount: s?.completedCount ?? 0,
        revenueLowMonthly: s?.revenueLowMonthlySum ?? null,
        revenueMediumMonthly: s?.revenueMediumMonthlySum ?? null,
        revenueHighMonthly: s?.revenueHighMonthlySum ?? null,
      });
    },
    [mapWrapRef, setHover, stateByName],
  );

  const projection = projectionForState(safeGeo, selectedState, stateByName);
  const projector = useMemo(
    () => geoMercator().center(projection.center).scale(projection.scale).translate([400, 300]),
    [projection.center, projection.scale],
  );
  const stateCenters = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const f of safeGeo.features) {
      const display = geoStateName(f.properties);
      const canonical = canonicalStateNameFromGeo(display, stateByName);
      const bbox = bboxFromFeature(f);
      if (!bbox) continue;
      const [minX, maxX, minY, maxY] = bbox;
      m.set(canonical, [(minX + maxX) / 2, (minY + maxY) / 2]);
    }
    return m;
  }, [safeGeo.features, stateByName]);
  const regionByStateKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of stateRegionPairs) {
      m.set(normalizeStateKey(p.stateName), p.regionName);
    }
    return m;
  }, [stateRegionPairs]);
  const projectedStateCenters = useMemo(() => {
    const out: { name: string; x: number; y: number }[] = [];
    for (const [name, ll] of stateCenters) {
      if (selectedState) continue;
      const p = projector(ll);
      if (!p) continue;
      out.push({ name, x: p[0], y: p[1] });
    }
    return out;
  }, [selectedState, projector, stateCenters]);
  const visibleStateNameLabels = useMemo(
    () => placeLabels(projectedStateCenters.map((s) => ({ id: s.name, x: s.x, y: s.y })), 36, 16, 60),
    [projectedStateCenters],
  );
  const projectedRegionLabels = useMemo(() => {
    if (selectedState) return [];
    const grouped = new Map<string, { x: number; y: number; c: number }>();
    for (const p of projectedStateCenters) {
      const regionName = regionByStateKey.get(normalizeStateKey(p.name));
      if (!regionName) continue;
      const g = grouped.get(regionName) ?? { x: 0, y: 0, c: 0 };
      g.x += p.x;
      g.y += p.y;
      g.c += 1;
      grouped.set(regionName, g);
    }
    return [...grouped.entries()].map(([name, g]) => ({
      name,
      x: g.x / Math.max(1, g.c),
      y: g.y / Math.max(1, g.c),
    }));
  }, [projectedStateCenters, regionByStateKey, selectedState]);
  const visibleFeatureKeys = useMemo(() => {
    if (!selectedState) return null;
    const keys = new Set<string>();
    for (const f of safeGeo.features) {
      const display = geoStateName(f.properties);
      const canonical = canonicalStateNameFromGeo(display, stateByName);
      if (canonical === selectedState) keys.add(canonical);
    }
    return keys;
  }, [safeGeo.features, selectedState, stateByName]);
  const projectedDistrictLabelIds = useMemo(() => {
    if (!selectedState) return new Set<string>();
    const projected = schoolMarkers
      .map((m) => {
        const p = projector([m.lon, m.lat]);
        if (!p) return null;
        const weight = m.totalStudents ?? m.totalBoys ?? m.totalGirls ?? 0;
        return { id: m.udise, x: p[0], y: p[1], w: weight };
      })
      .filter((x): x is { id: string; x: number; y: number; w: number } => Boolean(x))
      .sort((a, b) => b.w - a.w);
    return placeLabels(projected.map((p) => ({ id: p.id, x: p.x, y: p.y })), 18, 10, 200);
  }, [selectedState, projector, schoolMarkers]);
  const onMarkerMouseMove = useCallback(
    (
      e: MouseEvent<SVGCircleElement>,
      school: {
        udise: string;
        schoolName: string;
        district: string | null;
        state: string;
        totalStudents: number | null;
        totalBoys: number | null;
        totalGirls: number | null;
        revenueByScenario: {
          low: { monthly: number | null; annual: number | null };
          medium: { monthly: number | null; annual: number | null };
          high: { monthly: number | null; annual: number | null };
        };
        profileCompletenessPct: number | null;
      },
    ) => {
      const box = mapWrapRef.current?.getBoundingClientRect();
      if (!box) return;
      setMarkerHover({
        x: e.clientX - box.left,
        y: e.clientY - box.top,
        school,
      });
    },
    [mapWrapRef],
  );

  if (!geo) {
    return <div className="flex h-full items-center justify-center text-muted">Loading map…</div>;
  }

  return (
    <>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: projection.scale, center: projection.center }}
        className="h-full w-full"
      >
        <Geographies geography={geo}>
          {({ geographies }) =>
            geographies.map((g) => {
              const displayName = geoStateName(g.properties as IndiaGeoJson["features"][number]["properties"]);
              const canonicalName = canonicalStateNameFromGeo(displayName, stateByName);
              if (visibleFeatureKeys && !visibleFeatureKeys.has(canonicalName)) return null;
              const stats = stateByName.get(canonicalName);
              const fill = stateFill(canonicalName, stats, selectedState === canonicalName);
              const selected = selectedState === canonicalName;
              return (
                <MotionGeography
                  key={g.rsmKey}
                  geography={g}
                  fill={fill}
                  stroke={selected ? "#8FA6FF" : "#2A3A61"}
                  strokeWidth={selected ? 2.25 : 0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none" },
                    pressed: { outline: "none" },
                  }}
                  initial={false}
                  animate={{ opacity: 1 }}
                  whileHover={{ opacity: 0.9 }}
                  transition={selected ? normal : fast}
                  onMouseMove={(e: MouseEvent) => onGeoMouseMove(e, canonicalName)}
                  onMouseLeave={() => {
                    setHover(null);
                    setMarkerHover(null);
                  }}
                  onClick={() => onToggleState(canonicalName)}
                />
              );
            })
          }
        </Geographies>
        {!selectedState ? (
          <g>
            {projectedStateCenters.map((s) => (
              <g key={`state-dot-${s.name}`}>
                <circle cx={s.x} cy={s.y} r={4.8} fill="#8FA6FF" fillOpacity={0.26} />
                <circle cx={s.x} cy={s.y} r={2.4} fill="#E6EEFF" />
              </g>
            ))}
            {projectedStateCenters.map((s) => (
              <text
                key={`state-label-${s.name}`}
                x={s.x + 6}
                y={s.y - 4}
                fontSize="8.5"
                fontWeight={600}
                fill="#E6EEFF"
                stroke="#0A1224"
                strokeWidth="2"
                paintOrder="stroke"
                style={{ pointerEvents: "none" }}
              >
                {visibleStateNameLabels.has(s.name) ? s.name : ""}
              </text>
            ))}
            {projectedRegionLabels.map((r) => (
              <g key={`region-${r.name}`} style={{ pointerEvents: "none" }}>
                <rect
                  x={r.x - 42}
                  y={r.y - 9}
                  width={84}
                  height={16}
                  rx={8}
                  fill="#0A1224"
                  fillOpacity={0.72}
                />
                <text x={r.x} y={r.y + 3.5} fontSize="8" fontWeight={700} textAnchor="middle" fill="#E6EEFF">
                  {r.name}
                </text>
              </g>
            ))}
          </g>
        ) : null}
        {selectedState ? (
          <g>
            {schoolMarkers.map((m) => {
              const p = projector([m.lon, m.lat]);
              if (!p) return null;
              const active = selectedSchoolUdise === m.udise;
              return (
                <g key={m.udise}>
                  <circle
                    cx={p[0]}
                    cy={p[1]}
                    r={active ? 7 : 6}
                    fill={active ? "#5B7CFF" : "#8FA6FF"}
                    fillOpacity={0.2}
                    style={{ cursor: "pointer" }}
                    onMouseMove={(e) =>
                      onMarkerMouseMove(e, {
                        udise: m.udise,
                        schoolName: m.schoolName,
                        district: m.district,
                        state: m.state,
                        totalStudents: m.totalStudents,
                        totalBoys: m.totalBoys,
                        totalGirls: m.totalGirls,
                        revenueByScenario: m.revenueByScenario,
                        profileCompletenessPct: m.profileCompletenessPct,
                      })
                    }
                    onMouseLeave={() => setMarkerHover(null)}
                    onClick={() => onMarkerClick(m.udise, m.district)}
                  />
                  <circle
                    cx={p[0]}
                    cy={p[1]}
                    r={active ? 3.8 : 3.2}
                    fill={active ? "#8FA6FF" : "#E6EEFF"}
                    fillOpacity={0.95}
                    stroke="#0A1224"
                    strokeWidth={1}
                    style={{ cursor: "pointer" }}
                    onMouseMove={(e) =>
                      onMarkerMouseMove(e, {
                        udise: m.udise,
                        schoolName: m.schoolName,
                        district: m.district,
                        state: m.state,
                        totalStudents: m.totalStudents,
                        totalBoys: m.totalBoys,
                        totalGirls: m.totalGirls,
                        revenueByScenario: m.revenueByScenario,
                        profileCompletenessPct: m.profileCompletenessPct,
                      })
                    }
                    onMouseLeave={() => setMarkerHover(null)}
                    onClick={() => onMarkerClick(m.udise, m.district)}
                  />
                  {projectedDistrictLabelIds.has(m.udise) ? (
                    <text
                      x={p[0] + 5}
                      y={p[1] - 4}
                      fontSize="8"
                      fontWeight={600}
                      fill="#E6EEFF"
                      stroke="#0A1224"
                      strokeWidth="2"
                      paintOrder="stroke"
                      style={{ pointerEvents: "none" }}
                    >
                      {markerLocationLabel(m.district, m.schoolName)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        ) : null}
      </ComposableMap>
      <AnimatePresence>
        {hover ? (
          <motion.div
            key={hover.name}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={fast}
            className="pointer-events-none absolute z-10 w-[min(86vw,240px)] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-700 shadow-[0_14px_30px_rgba(15,23,42,0.16)] sm:px-3 sm:text-xs"
            style={{ left: `${Math.max(8, hover.x + 12)}px`, top: `${Math.max(8, hover.y + 12)}px` }}
          >
            <div className="font-semibold text-slate-900">{hover.name}</div>
            <div className="mt-1 space-y-0.5">
              <div>JNVs: {hover.schoolCount}</div>
              <div>Students: {hover.studentSum.toLocaleString()}</div>
              <div>Parse complete: {hover.completedCount}</div>
              <div className="border-t border-slate-100 pt-1 text-[10px] text-slate-600 sm:text-[11px]">
                <div className="font-medium text-slate-700">Revenue (sum / mo)</div>
                <div className="text-emerald-700">Low: {formatRev(hover.revenueLowMonthly)}</div>
                <div className="text-yellow-700">Medium: {formatRev(hover.revenueMediumMonthly)}</div>
                <div className="text-rose-800">High: {formatRev(hover.revenueHighMonthly)}</div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {markerHover ? (
          <motion.div
            key={markerHover.school.udise}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={fast}
            className="pointer-events-none absolute z-20 w-[min(90vw,320px)] rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-700 shadow-[0_16px_34px_rgba(15,23,42,0.18)] sm:px-3 sm:text-xs"
            style={{ left: `${Math.max(8, markerHover.x + 12)}px`, top: `${Math.max(8, markerHover.y + 12)}px` }}
          >
            <div className="text-[12px] font-semibold text-slate-900">{markerHover.school.schoolName}</div>
            <div className="mt-0.5 text-[11px] text-slate-600">
              {markerLocationLabel(markerHover.school.district, markerHover.school.schoolName)}, {markerHover.school.state}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <div>UDISE: {markerHover.school.udise}</div>
              <div>Students: {markerHover.school.totalStudents ?? "—"}</div>
              <div>Boys: {markerHover.school.totalBoys ?? "—"}</div>
              <div>Girls: {markerHover.school.totalGirls ?? "—"}</div>
              <div className="text-emerald-700">Low/mo: {formatRev(markerHover.school.revenueByScenario.low.monthly)}</div>
              <div className="text-yellow-700">Medium/mo: {formatRev(markerHover.school.revenueByScenario.medium.monthly)}</div>
              <div className="text-rose-800">High/mo: {formatRev(markerHover.school.revenueByScenario.high.monthly)}</div>
              <div className="col-span-2">
                Model insight: low / medium / high revenue bands
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function formatRev(n: number | null) {
  if (n == null || n <= 0) return "—";
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L / mo`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k / mo`;
  return `₹${Math.round(n).toLocaleString("en-IN")} / mo`;
}

export const IndiaMapCanvas = memo(IndiaMapCanvasInner);
