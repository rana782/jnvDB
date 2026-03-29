import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCached, setCached } from "../../shared/response-cache.js";
import { mapDistrictAggregates, mapStateAggregates, type MapColorBy } from "./map.service.js";

const MAP_CACHE_TTL_MS = 45_000;

function mapCacheKey(kind: "states" | "districts", query: Record<string, unknown>): string {
  const sorted = Object.keys(query)
    .filter((k) => {
      const v = query[k];
      return v !== undefined && v !== "" && v !== null;
    })
    .sort()
    .map((k) => `${k}=${String(query[k])}`)
    .join("&");
  return `map:${kind}:${sorted}`;
}

const boolQ = z.enum(["true", "false"]).optional();

const mapQuerySchema = z.object({
  water: boolQ,
  electricity: boolQ,
  internet: boolQ,
  pipelineStatus: z.string().optional(),
  highReadiness: boolQ,
  minReadinessPct: z.coerce.number().min(0).max(100).optional(),
  highStudentCount: boolQ,
  minStudentHeadcount: z.coerce.number().min(0).optional(),
  completedOnly: boolQ,
  colorBy: z.enum(["jnv_count", "readiness"]).optional().default("jnv_count"),
});

function parseBool(v: string | undefined): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function mapFiltersFromQuery(q: z.infer<typeof mapQuerySchema>) {
  return {
    water: parseBool(q.water),
    electricity: parseBool(q.electricity),
    internet: parseBool(q.internet),
    pipelineStatus: q.pipelineStatus,
    highReadiness: q.highReadiness === "true",
    minReadinessPct: q.minReadinessPct,
    highStudentCount: q.highStudentCount === "true",
    minStudentHeadcount: q.minStudentHeadcount,
    completedOnly: q.completedOnly === "true",
  };
}

export const registerMapRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/map", async (request) => {
    const q = mapQuerySchema.parse(request.query);
    const colorBy = q.colorBy as MapColorBy;
    const key = mapCacheKey("states", q as Record<string, unknown>);
    const cached = getCached<Awaited<ReturnType<typeof mapStateAggregates>>>(key);
    if (cached !== undefined) return cached;
    const body = await mapStateAggregates(mapFiltersFromQuery(q), colorBy);
    setCached(key, body, MAP_CACHE_TTL_MS);
    return body;
  });

  app.get("/dashboard/map/districts", async (request) => {
    const q = mapQuerySchema
      .extend({
        state: z.string().min(1, "state is required"),
      })
      .parse(request.query);
    const key = mapCacheKey("districts", q as Record<string, unknown>);
    const cached = getCached<Awaited<ReturnType<typeof mapDistrictAggregates>>>(key);
    if (cached !== undefined) return cached;
    const body = await mapDistrictAggregates(q.state, mapFiltersFromQuery(q));
    setCached(key, body, MAP_CACHE_TTL_MS);
    return body;
  });
};
