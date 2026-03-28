import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiMe } from "../lib/api.js";

const nav = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/map", label: "Map" },
  { to: "/schools", label: "Schools" },
  { to: "/revenue", label: "Revenue" },
  { to: "/progress", label: "Progress" },
  { to: "/compare", label: "Compare" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings" },
];

export function Shell() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: apiMe,
    retry: false,
  });

  if (me.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Loading session…
      </div>
    );
  }

  if (me.isError) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-navy">
        <div className="border-b border-slate-800 px-4 py-4">
          <div className="text-sm font-semibold text-teal-light">JNV Intelligence</div>
          <div className="text-xs text-slate-400">{me.data.user.rollcode}</div>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "rounded-md px-3 py-2 text-sm transition",
                  isActive ? "bg-teal/20 text-teal-light" : "text-slate-300 hover:bg-slate-800",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 bg-navy-light/40 px-6 py-3">
          <div className="text-sm text-slate-400">Portfolio intelligence · PM SHRI JNV</div>
          <div className="text-xs text-slate-500">Internal use</div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
