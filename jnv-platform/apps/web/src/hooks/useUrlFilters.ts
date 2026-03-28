import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type ListFilters = {
  q: string;
  state: string;
  pipelineStatus: string;
  page: number;
};

const defaults: ListFilters = { q: "", state: "", pipelineStatus: "", page: 1 };

export function useUrlFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo((): ListFilters => {
    const page = Math.max(1, Number(params.get("page") || 1) || 1);
    return {
      q: params.get("q") ?? "",
      state: params.get("state") ?? "",
      pipelineStatus: params.get("pipeline") ?? "",
      page,
    };
  }, [params]);

  const setFilters = useCallback(
    (patch: Partial<ListFilters>) => {
      const next = new URLSearchParams(params);
      const merged = { ...filters, ...patch };
      if (merged.q) next.set("q", merged.q);
      else next.delete("q");
      if (merged.state) next.set("state", merged.state);
      else next.delete("state");
      if (merged.pipelineStatus) next.set("pipeline", merged.pipelineStatus);
      else next.delete("pipeline");
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
