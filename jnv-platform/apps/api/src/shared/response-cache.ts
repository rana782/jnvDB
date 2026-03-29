/**
 * Short TTL JSON cache for expensive read endpoints (map, dashboard).
 * Invalidated when map rollups refresh after import.
 */

type Entry = { exp: number; value: unknown };

const store = new Map<string, Entry>();

export function getCached<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e || e.exp <= Date.now()) {
    if (e) store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function setCached(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { exp: Date.now() + ttlMs, value });
}

export function invalidateByPrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

export function invalidateMapAndDashboardCache(): void {
  invalidateByPrefix("map:");
  invalidateByPrefix("dash:overview:");
  invalidateByPrefix("dash:deploy:");
}
