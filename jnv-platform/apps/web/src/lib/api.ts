const base = import.meta.env.VITE_API_BASE_URL ?? "";

export const JNV_TOKEN_STORAGE_KEY = "jnv_token";

if (!base && import.meta.env.PROD) {
  // eslint-disable-next-line no-console
  console.warn(
    "[jnv-web] VITE_API_BASE_URL is empty in production; API calls will go to relative paths. Set VITE_API_BASE_URL to your Render API origin.",
  );
}

function bearerHeaders(path: string): HeadersInit {
  if (path.startsWith("/api/auth/login")) return {};
  try {
    const t = localStorage.getItem(JNV_TOKEN_STORAGE_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

function mergeJsonHeaders(path: string, initHeaders?: HeadersInit): Headers {
  const h = new Headers();
  h.set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(bearerHeaders(path))) {
    h.set(k, v);
  }
  if (initHeaders) {
    const extra = new Headers(initHeaders);
    extra.forEach((value, key) => {
      h.set(key, value);
    });
  }
  return h;
}

export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const { headers: initHeaders, ...rest } = init;
  return fetch(`${base}${path}`, {
    ...rest,
    mode: "cors",
    headers: mergeJsonHeaders(path, initHeaders),
  });
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiRequest(path, init ?? {});
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function apiPatchJson<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiLogin(rollcode: string, password: string) {
  return apiJson<{
    token: string;
    user: { id: string; rollcode: string; roles: string[] };
  }>("/api/auth/login", { method: "POST", body: JSON.stringify({ rollcode, password }) });
}

export async function apiMe() {
  return apiJson<{ user: { id: string; rollcode: string; roles: string[] } }>("/api/auth/me");
}

export async function apiLogout() {
  return apiJson<{ ok: boolean }>("/api/auth/logout", { method: "POST", body: "{}" });
}
