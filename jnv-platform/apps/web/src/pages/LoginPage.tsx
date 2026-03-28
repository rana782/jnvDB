import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiLogin } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rollcode, setRollcode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () => apiLogin(rollcode, password),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate("/dashboard", { replace: true });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-navy-light p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-white">Founder login</h1>
        <p className="mt-1 text-sm text-slate-400">Rollcode and password (httpOnly cookie session).</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            login.mutate();
          }}
        >
          <div>
            <label htmlFor="login-rollcode" className="text-xs text-slate-400">
              Rollcode
            </label>
            <input
              id="login-rollcode"
              name="rollcode"
              aria-label="Rollcode"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              value={rollcode}
              onChange={(e) => setRollcode(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="text-xs text-slate-400">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              aria-label="Password"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-sm text-amber">{error}</p> : null}
          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-md bg-teal px-3 py-2 text-sm font-medium text-white hover:bg-teal-light disabled:opacity-50"
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
