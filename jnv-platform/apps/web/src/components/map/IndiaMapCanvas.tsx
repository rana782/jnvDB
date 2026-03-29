import type { MouseEvent } from "react";
import { memo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  monthlyRevenueSum: number | null;
} | null;

export type IndiaGeoJson = { type: string; features: { properties: { name?: string } }[] };

function stateFill(
  stats: Pick<MapAggState, "schoolCount" | "avgReadiness"> | undefined,
  colorBy: "jnv_count" | "readiness",
  maxCount: number,
  maxReadiness: number,
  selected: boolean,
): string {
  if (selected) return "#bfdbfe";
  if (!stats || stats.schoolCount === 0) return "#e2e8f0";
  if (colorBy === "jnv_count") {
    const t = maxCount > 0 ? Math.min(1, stats.schoolCount / maxCount) : 0;
    const a = 0.35 + t * 0.55;
    return `rgba(37, 99, 235, ${a.toFixed(3)})`;
  }
  const r = stats.avgReadiness ?? 0;
  const t = maxReadiness > 0 ? Math.min(1, r / maxReadiness) : 0;
  const a = 0.3 + t * 0.55;
  return `rgba(16, 185, 129, ${a.toFixed(3)})`;
}

type Props = {
  geo: IndiaGeoJson | undefined;
  stateByName: Map<string, MapAggState>;
  stateRevenueByName: Map<string, number>;
  colorBy: "jnv_count" | "readiness";
  maxCount: number;
  maxReadiness: number;
  selectedState: string | null;
  mapWrapRef: React.RefObject<HTMLDivElement | null>;
  hover: MapHoverState;
  setHover: (h: MapHoverState) => void;
  onToggleState: (geoName: string) => void;
};

function IndiaMapCanvasInner({
  geo,
  stateByName,
  stateRevenueByName,
  colorBy,
  maxCount,
  maxReadiness,
  selectedState,
  mapWrapRef,
  hover,
  setHover,
  onToggleState,
}: Props) {
  const onGeoMouseMove = useCallback(
    (e: MouseEvent, geoName: string) => {
      const box = mapWrapRef.current?.getBoundingClientRect();
      if (!box) return;
      const s = stateByName.get(geoName);
      const rev = stateRevenueByName.get(geoName);
      setHover({
        name: geoName,
        x: e.clientX - box.left,
        y: e.clientY - box.top,
        schoolCount: s?.schoolCount ?? 0,
        studentSum: s?.studentSum ?? 0,
        avgReadiness: s?.avgReadiness ?? null,
        completedCount: s?.completedCount ?? 0,
        monthlyRevenueSum: rev ?? null,
      });
    },
    [mapWrapRef, setHover, stateByName, stateRevenueByName],
  );

  if (!geo) {
    return <div className="flex h-full items-center justify-center text-[#64748B]">Loading map…</div>;
  }

  return (
    <>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 600, center: [80, 22] }}
        className="h-full w-full"
      >
        <Geographies geography={geo}>
          {({ geographies }) =>
            geographies.map((g) => {
              const name = String(g.properties.name ?? "");
              const stats = stateByName.get(name);
              const fill = stateFill(stats, colorBy, maxCount, maxReadiness, selectedState === name);
              const selected = selectedState === name;
              return (
                <MotionGeography
                  key={g.rsmKey}
                  geography={g}
                  fill={fill}
                  stroke={selected ? "#2563EB" : "#cbd5e1"}
                  strokeWidth={selected ? 2.25 : 0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none" },
                    pressed: { outline: "none" },
                  }}
                  initial={false}
                  animate={{
                    scale: selected ? 1.04 : 1,
                  }}
                  whileHover={{ scale: selected ? 1.05 : 1.02 }}
                  transition={selected ? normal : fast}
                  onMouseMove={(e: MouseEvent) => onGeoMouseMove(e, name)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onToggleState(name)}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      <AnimatePresence>
        {hover ? (
          <motion.div
            key={hover.name}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={fast}
            className="pointer-events-none absolute z-10 max-w-[240px] rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#64748B] shadow-lg"
            style={{ left: `${Math.max(8, hover.x + 12)}px`, top: `${Math.max(8, hover.y + 12)}px` }}
          >
            <div className="font-semibold text-[#0F172A]">{hover.name}</div>
            <div className="mt-1 space-y-0.5">
              <div>JNVs: {hover.schoolCount}</div>
              <div>Students: {hover.studentSum.toLocaleString()}</div>
              <div>Avg readiness: {hover.avgReadiness != null ? `${hover.avgReadiness}%` : "—"}</div>
              <div>Revenue (model): {formatRev(hover.monthlyRevenueSum)}</div>
              <div>Parse complete: {hover.completedCount}</div>
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
  return `₹${Math.round(n).toLocaleString()} / mo`;
}

export const IndiaMapCanvas = memo(IndiaMapCanvasInner);
