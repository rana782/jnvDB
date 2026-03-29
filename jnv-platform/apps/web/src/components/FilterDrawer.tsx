import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../lib/api";
import { fast, normal } from "../lib/animationConfig";

type RegionRow = { id: string; code: string; name: string };

async function fetchRegions(): Promise<RegionRow[]> {
  return apiJson<RegionRow[]>("/api/geo/regions");
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function FilterDrawer({ open, onClose }: Props) {
  const navigate = useNavigate();
  const regionsQ = useQuery({ queryKey: ["geo-regions"], queryFn: fetchRegions, staleTime: 300_000 });
  const [state, setState] = useState("");
  const [regionId, setRegionId] = useState("");
  const [minStudents, setMinStudents] = useState("");
  const [maxStudents, setMaxStudents] = useState("");
  const [minReadiness, setMinReadiness] = useState("");
  const [maxReadiness, setMaxReadiness] = useState("");
  const [minRev, setMinRev] = useState("");
  const [maxRev, setMaxRev] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const apply = () => {
    const p = new URLSearchParams();
    if (state.trim()) p.set("state", state.trim());
    if (regionId) p.set("regionId", regionId);
    if (minStudents) p.set("minStudents", minStudents);
    if (maxStudents) p.set("maxStudents", maxStudents);
    if (minReadiness) p.set("minReadiness", minReadiness);
    if (maxReadiness) p.set("maxReadiness", maxReadiness);
    if (minRev) p.set("minMonthlyRevenue", minRev);
    if (maxRev) p.set("maxMonthlyRevenue", maxRev);
    const qs = p.toString();
    navigate(qs ? `/deployment?${qs}` : "/deployment");
    onClose();
  };

  const reset = () => {
    setState("");
    setRegionId("");
    setMinStudents("");
    setMaxStudents("");
    setMinReadiness("");
    setMaxReadiness("");
    setMinRev("");
    setMaxRev("");
    navigate("/map");
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close filters"
            className="fixed inset-0 z-40 bg-[#0F172A]/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={normal}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-[320px] flex-col border-l border-[#E2E8F0] bg-white shadow-2xl"
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={normal}
          >
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
              <h2 className="text-base font-semibold text-[#0F172A]">Filters</h2>
              <motion.button
                type="button"
                className="rounded-md p-1 text-[#64748B] transition-colors duration-100 hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                onClick={onClose}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={fast}
              >
                ✕
              </motion.button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
              <p className="text-xs text-[#64748B]">
                Apply sends you to the deployment dashboard with the same query API. Map quick filters stay on the map
                page.
              </p>
              <label className="block text-xs font-medium text-[#64748B]">
                State (contains)
                <input
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[#0F172A] outline-none transition-shadow duration-150 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State name"
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B]">
                Region
                <select
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  value={regionId}
                  onChange={(e) => setRegionId(e.target.value)}
                >
                  <option value="">All regions</option>
                  {(regionsQ.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-[#64748B]">
                  Min students
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[#0F172A]"
                    value={minStudents}
                    onChange={(e) => setMinStudents(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-[#64748B]">
                  Max students
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[#0F172A]"
                    value={maxStudents}
                    onChange={(e) => setMaxStudents(e.target.value)}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-[#64748B]">
                  Min readiness %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[#0F172A]"
                    value={minReadiness}
                    onChange={(e) => setMinReadiness(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-[#64748B]">
                  Max readiness %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[#0F172A]"
                    value={maxReadiness}
                    onChange={(e) => setMaxReadiness(e.target.value)}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-[#64748B]">
                  Min ₹ / mo
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[#0F172A]"
                    value={minRev}
                    onChange={(e) => setMinRev(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-[#64748B]">
                  Max ₹ / mo
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[#0F172A]"
                    value={maxRev}
                    onChange={(e) => setMaxRev(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="flex gap-2 border-t border-[#E2E8F0] p-4">
              <motion.button
                type="button"
                className="flex-1 rounded-lg bg-[#2563EB] py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1d4ed8]"
                onClick={apply}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={fast}
              >
                Apply
              </motion.button>
              <motion.button
                type="button"
                className="rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm font-medium text-[#64748B] transition-colors duration-150 hover:bg-[#F8FAFC]"
                onClick={reset}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={fast}
              >
                Reset
              </motion.button>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
