import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/** Schools list filters mirrored in the query string (names match GET /api/schools). */
export type SchoolListUrlFilters = {
  q: string;
  state: string;
  district: string;
  pipelineStatus: string;
  parsingStatus: string;
  page: number;
  minStudents: string;
  maxStudents: string;
  minBoys: string;
  maxBoys: string;
  minGirls: string;
  maxGirls: string;
  minCompleteness: string;
  maxCompleteness: string;
  minScRatioPct: string;
  maxScRatioPct: string;
  minStRatioPct: string;
  maxStRatioPct: string;
  minObcRatioPct: string;
  maxObcRatioPct: string;
  ageBand: string;
  minAgeSharePct: string;
  maxAgeSharePct: string;
  minGirlsSharePct: string;
  maxGirlsSharePct: string;
};

const defaults: SchoolListUrlFilters = {
  q: "",
  state: "",
  district: "",
  pipelineStatus: "",
  parsingStatus: "",
  page: 1,
  minStudents: "",
  maxStudents: "",
  minBoys: "",
  maxBoys: "",
  minGirls: "",
  maxGirls: "",
  minCompleteness: "",
  maxCompleteness: "",
  minScRatioPct: "",
  maxScRatioPct: "",
  minStRatioPct: "",
  maxStRatioPct: "",
  minObcRatioPct: "",
  maxObcRatioPct: "",
  ageBand: "",
  minAgeSharePct: "",
  maxAgeSharePct: "",
  minGirlsSharePct: "",
  maxGirlsSharePct: "",
};

const KEYS = Object.keys(defaults).filter((k) => k !== "page") as (keyof Omit<
  SchoolListUrlFilters,
  "page"
>)[];

function readFilters(params: URLSearchParams): SchoolListUrlFilters {
  const page = Math.max(1, Number(params.get("page") || 1) || 1);
  return {
    ...defaults,
    page,
    q: params.get("q") ?? "",
    state: params.get("state") ?? "",
    district: params.get("district") ?? "",
    pipelineStatus: params.get("pipelineStatus") ?? "",
    parsingStatus: params.get("parsingStatus") ?? "",
    minStudents: params.get("minStudents") ?? "",
    maxStudents: params.get("maxStudents") ?? "",
    minBoys: params.get("minBoys") ?? "",
    maxBoys: params.get("maxBoys") ?? "",
    minGirls: params.get("minGirls") ?? "",
    maxGirls: params.get("maxGirls") ?? "",
    minCompleteness: params.get("minCompleteness") ?? "",
    maxCompleteness: params.get("maxCompleteness") ?? "",
    minScRatioPct: params.get("minScRatioPct") ?? "",
    maxScRatioPct: params.get("maxScRatioPct") ?? "",
    minStRatioPct: params.get("minStRatioPct") ?? "",
    maxStRatioPct: params.get("maxStRatioPct") ?? "",
    minObcRatioPct: params.get("minObcRatioPct") ?? "",
    maxObcRatioPct: params.get("maxObcRatioPct") ?? "",
    ageBand: params.get("ageBand") ?? "",
    minAgeSharePct: params.get("minAgeSharePct") ?? "",
    maxAgeSharePct: params.get("maxAgeSharePct") ?? "",
    minGirlsSharePct: params.get("minGirlsSharePct") ?? "",
    maxGirlsSharePct: params.get("maxGirlsSharePct") ?? "",
  };
}

export function useUrlFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => readFilters(params), [params]);

  const setFilters = useCallback(
    (patch: Partial<SchoolListUrlFilters>) => {
      const next = new URLSearchParams(params);
      const merged = { ...filters, ...patch };
      for (const key of KEYS) {
        const v = merged[key];
        if (typeof v === "string" && v.trim() !== "") next.set(key, v.trim());
        else next.delete(key);
      }
      if (merged.page > 1) next.set("page", String(merged.page));
      else next.delete("page");
      setParams(next, { replace: true });
    },
    [filters, params, setParams],
  );

  const reset = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  return { filters, setFilters, reset, defaults };
}
