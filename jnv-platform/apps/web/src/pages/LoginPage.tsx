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
      navigate("/map", { replace: true });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-card p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-ink">Founder login</h1>
        <p className="mt-1 text-sm text-muted">Rollcode and password (httpOnly cookie session).</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            login.mutate();
          }}
        >
          <div>
            <label htmlFor="login-rollcode" className="text-xs font-medium text-muted">
              Rollcode
            </label>
            <input
              id="login-rollcode"
              name="rollcode"
              aria-label="Rollcode"
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none transition-all duration-150 focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={rollcode}
              onChange={(e) => setRollcode(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="text-xs font-medium text-muted">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              aria-label="Password"
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none transition-all duration-150 focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover disabled:opacity-50"
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
