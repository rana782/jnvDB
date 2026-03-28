import { useQuery } from "@tanstack/react-query";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Link } from "react-router-dom";
import { apiJson } from "../lib/api";
import type { MapAgg } from "../types/school-api";

async function loadGeo() {
  const res = await fetch("/india-states.geojson");
  return res.json() as Promise<{ type: string; features: { properties: { name?: string } }[] }>;
}

async function loadMap(): Promise<MapAgg> {
  return apiJson<MapAgg>("/api/dashboard/map");
}

export function MapPage() {
  const geo = useQuery({ queryKey: ["india-geo"], queryFn: loadGeo });
  const map = useQuery({ queryKey: ["map"], queryFn: loadMap });

  const counts = new Map(map.data?.states.map((s) => [s.name, s.schoolCount]) ?? []);

  if (map.isError) {
    return (
      <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
        Could not load map aggregates from the API.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Map</h1>
        <p className="text-sm text-slate-400">State heat from `/api/dashboard/map` with drilldown lists.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-navy-light p-4">
          <div className="mb-2 text-xs text-slate-500">Legend: fill intensity ∝ school count</div>
          <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-900">
            {geo.data ? (
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{ scale: 600, center: [80, 22] }}
                className="h-full w-full"
              >
                <Geographies geography={geo.data}>
                  {({ geographies }) =>
                    geographies.map((g) => {
                      const name = String(g.properties.name ?? "");
                      const c = counts.get(name) ?? 0;
                      const fill = c > 45 ? "#0d9488" : c > 35 ? "#34d399" : "#1e293b";
                      return (
                        <Geography
                          key={g.rsmKey}
                          geography={g}
                          fill={fill}
                          stroke="#0f172a"
                          style={{
                            default: { outline: "none" },
                            hover: { fill: "#2dd4bf", outline: "none" },
                            pressed: { outline: "none" },
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </ComposableMap>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">Loading map…</div>
            )}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-800 bg-navy-light p-4">
          <h2 className="text-sm font-semibold text-slate-200">States</h2>
          {map.isPending ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {(map.data?.states ?? []).map((s) => (
                <li key={s.name} className="flex items-center justify-between rounded-md bg-slate-900/60 px-3 py-2">
                  <Link className="text-teal-light hover:underline" to={`/schools?state=${encodeURIComponent(s.name)}`}>
                    {s.name}
                  </Link>
                  <span className="text-slate-400">
                    {s.schoolCount} schools · {s.studentSum.toLocaleString()} students
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="pt-4 text-sm font-semibold text-slate-200">NVS regions</h2>
          <ul className="space-y-2 text-sm text-slate-300">
            {(map.data?.regions ?? []).map((r) => (
              <li key={r.name} className="flex justify-between rounded-md bg-slate-900/40 px-3 py-2">
                <span>{r.name}</span>
                <span className="text-slate-400">{r.schoolCount} schools</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
