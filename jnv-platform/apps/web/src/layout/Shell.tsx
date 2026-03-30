import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { NavLink, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiMe } from "../lib/api.js";
import { ShellOutletProvider } from "./ShellContext";
import { AnimatedOutlet } from "./AnimatedOutlet";
import { normal } from "../lib/animationConfig";

const nav: { to: string; label: string }[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/map", label: "Map" },
  { to: "/schools", label: "Schools" },
  { to: "/compare", label: "Compare" },
  { to: "/revenue", label: "Revenue" },
  { to: "/progress", label: "Progress" },
  { to: "/settings", label: "Settings" },
];

function defaultBreadcrumb(pathname: string): ReactNode {
  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    map: "Map",
    schools: "Schools",
    compare: "Compare",
    revenue: "Revenue",
    progress: "Progress",
    settings: "Settings",
  };
  const seg = pathname.split("/").filter(Boolean)[0] ?? "map";
  return <span className="text-sm font-medium text-ink">{labels[seg] ?? seg}</span>;
}

export function Shell() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: apiMe,
    retry: false,
  });
  const location = useLocation();
  const [breadcrumb, setBreadcrumb] = useState<ReactNode | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isMap = location.pathname === "/map";

  const outletContext = useMemo(
    () => ({
      setBreadcrumb,
    }),
    [],
  );

  const crumb = breadcrumb ?? defaultBreadcrumb(location.pathname);

  if (me.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        Loading session…
      </div>
    );
  }

  if (me.isError) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-canvas bg-premium-radial">
      <motion.aside
        className="hidden w-[272px] shrink-0 flex-col border-r border-line bg-surface-1 text-ink shadow-premium lg:flex"
        initial={{ x: -260, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={normal}
      >
        <div className="border-b border-line px-5 py-5">
          <div className="text-lg font-semibold tracking-tight premium-gradient-text">JNV Intelligence</div>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                [
                  "relative rounded-lg py-2.5 pl-4 pr-3 text-sm font-medium transition-all duration-150 ease-out",
                  isActive
                    ? "border-l-[3px] border-accent bg-accent/20 text-ink shadow-glow"
                    : "border-l-[3px] border-transparent text-muted hover:bg-surface-3 hover:text-ink",
                ].join(" ")
              }
            >
              {item.label}
              {item.to === "/map" ? (
                <span className="ml-1.5 text-warning" title="Primary navigation">
                  ●
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line px-5 py-4 text-xs text-muted">
          {me.data.user.rollcode}
        </div>
      </motion.aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-surface-2/95 px-4 backdrop-blur lg:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line bg-card text-ink lg:hidden"
            onClick={() => setMobileNavOpen(true)}
          >
            ☰
          </button>
          <div className="min-w-0 flex-1 text-muted lg:max-w-[40%]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">{crumb}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2" />
        </header>

        <main
          className={
            isMap
              ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas"
              : "min-h-0 flex-1 overflow-y-auto bg-canvas p-3 sm:p-4 lg:p-6"
          }
        >
          <ShellOutletProvider value={outletContext}>
            <AnimatedOutlet />
          </ShellOutletProvider>
        </main>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setMobileNavOpen(false)}
          />
          <motion.aside
            className="absolute left-0 top-0 flex h-full w-[82%] max-w-[310px] flex-col border-r border-line bg-surface-1 text-ink shadow-premium"
            initial={{ x: -260, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -260, opacity: 0.6 }}
            transition={normal}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="text-base font-semibold tracking-tight premium-gradient-text">JNV Intelligence</div>
              <button
                type="button"
                className="rounded-md border border-line px-2 py-1 text-xs text-ink"
                onClick={() => setMobileNavOpen(false)}
              >
                Close
              </button>
            </div>
            <nav className="flex flex-col gap-0.5 p-3">
              {nav.map((item) => (
                <NavLink
                  key={`m-${item.to}`}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    [
                      "relative rounded-lg py-2.5 pl-4 pr-3 text-sm font-medium transition-all duration-150 ease-out",
                      isActive
                        ? "border-l-[3px] border-accent bg-accent/20 text-ink shadow-glow"
                        : "border-l-[3px] border-transparent text-muted hover:bg-surface-3 hover:text-ink",
                    ].join(" ")
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto border-t border-line px-5 py-4 text-xs text-muted">{me.data.user.rollcode}</div>
          </motion.aside>
        </div>
      ) : null}
    </div>
  );
}
