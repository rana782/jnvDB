import { createContext, useContext, type ReactNode } from "react";

export type ShellOutletContext = {
  setBreadcrumb: (node: ReactNode | null) => void;
};

const ShellCtx = createContext<ShellOutletContext | null>(null);

export function ShellOutletProvider({
  value,
  children,
}: {
  value: ShellOutletContext;
  children: ReactNode;
}) {
  return <ShellCtx.Provider value={value}>{children}</ShellCtx.Provider>;
}

export function useShellOutlet(): ShellOutletContext {
  const v = useContext(ShellCtx);
  if (!v) throw new Error("useShellOutlet must be used under Shell");
  return v;
}
