const base = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function apiLogin(rollcode: string, password: string) {
  return apiJson<{ user: { rollcode: string; displayName: string | null; roles: string[] } }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ rollcode, password }) },
  );
}

export async function apiMe() {
  return apiJson<{ user: { id: string; rollcode: string; roles: string[] } }>("/api/auth/me");
}

export async function apiLogout() {
  return apiJson<{ ok: boolean }>("/api/auth/logout", { method: "POST", body: "{}" });
}
