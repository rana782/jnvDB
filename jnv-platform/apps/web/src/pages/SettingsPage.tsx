import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiLogout } from "../lib/api";
import { useNavigate } from "react-router-dom";

export function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: apiLogout,
    onSuccess: async () => {
      await qc.clear();
      navigate("/login");
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-ink">Settings</h1>
      <p className="text-sm text-muted">Session uses httpOnly cookies; logout clears the token.</p>
      <button
        type="button"
        className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-colors duration-100 hover:bg-canvas"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        {logout.isPending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
