import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiMe } from "../lib/api.js";
import { FilterDrawer } from "../components/FilterDrawer";
import { ShellOutletProvider } from "./ShellContext";
import { AnimatedOutlet } from "./AnimatedOutlet";
import { normal } from "../lib/animationConfig";

const nav: { to: string; label: string }[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/map", label: "Map" },
  { to: "/deployment", label: "Deployment" },
  { to: "/schools", label: "Schools" },
  { to: "/compare", label: "Compare" },
  { to: "/revenue", label: "Revenue" },
  { to: "/progress", label: "Progress" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings" },
];

function defaultBreadcrumb(pathname: string): ReactNode {
  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    map: "Map",
    deployment: "Deployment",
    schools: "Schools",
    compare: "Compare",
    revenue: "Revenue",
    progress: "Progress",
    reports: "Reports",
    settings: "Settings",
  };
  const seg = pathname.split("/").filter(Boolean)[0] ?? "map";
  return <span className="text-sm font-medium text-[#0F172A]">{labels[seg] ?? seg}</span>;
}

function initials(rollcode: string): string {
  const t = rollcode.trim().slice(0, 2).toUpperCase();
  return t || "U";
}

export function Shell() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: apiMe,
    retry: false,
  });
  const location = useLocation();
  const navigate = useNavigate();
  const [breadcrumb, setBreadcrumb] = useState<ReactNode | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  const isMap = location.pathname === "/map";

  const outletContext = useMemo(
    () => ({
      setBreadcrumb,
      setFilterOpen,
    }),
    [],
  );

  const crumb = breadcrumb ?? defaultBreadcrumb(location.pathname);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchQ.trim();
    if (!q) return;
    navigate(`/schools?page=1&q=${encodeURIComponent(q)}`);
    setSearchQ("");
  };

  if (me.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[#64748B]">
        Loading session…
      </div>
    );
  }

  if (me.isError) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <motion.aside
        className="flex w-[260px] shrink-0 flex-col bg-[#0F172A] text-white"
        initial={{ x: -260, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={normal}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <div className="text-lg font-semibold tracking-tight text-white">JNV Intelligence</div>
          <div className="mt-1 text-xs text-white/50">PM SHRI · Portfolio</div>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "relative rounded-md py-2.5 pl-4 pr-3 text-sm font-medium transition-colors duration-150 ease-out",
                  isActive
                    ? "border-l-[3px] border-[#2563EB] bg-[#2563EB]/15 text-white"
                    : "border-l-[3px] border-transparent text-white/70 hover:bg-white/5 hover:text-white",
                ].join(" ")
              }
            >
              {item.label}
              {item.to === "/map" ? (
                <span className="ml-1.5 text-amber-400" title="Primary navigation">
                  ●
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 px-5 py-4 text-xs text-white/40">
          {me.data.user.rollcode}
        </div>
      </motion.aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[#E2E8F0] bg-white px-4 lg:px-6">
          <div className="min-w-0 flex-1 text-[#64748B] lg:max-w-[40%]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">{crumb}</div>
          </div>
          <form
            onSubmit={onSearch}
            className="hidden max-w-md flex-1 md:block"
          >
            <input
              type="search"
              name="q"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search school name or UDISE…"
              className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-sm text-[#0F172A] placeholder:text-[#94a3b8] outline-none transition-all duration-150 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </form>
          <div className="flex shrink-0 items-center gap-2">
            <motion.button
              type="button"
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#0F172A] transition-colors duration-150 hover:bg-[#F8FAFC]"
              onClick={() => setFilterOpen(true)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.25, 0.8, 0.25, 1] }}
            >
              Filters
            </motion.button>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2563EB] text-xs font-semibold text-white"
              title={me.data.user.rollcode}
            >
              {initials(me.data.user.rollcode)}
            </div>
          </div>
        </header>

        <main
          className={
            isMap
              ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9]"
              : "min-h-0 flex-1 overflow-y-auto bg-[#F8FAFC] p-6"
          }
        >
          <ShellOutletProvider value={outletContext}>
            <AnimatedOutlet />
          </ShellOutletProvider>
        </main>
      </div>

      <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} />
    </div>
  );
}
