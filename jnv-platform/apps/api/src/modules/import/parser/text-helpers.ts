/** Shared numeric / regex helpers for report-card section parsers. */

export function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

export function str(s: string | undefined, fallback = ""): string {
  return (s ?? "").trim() || fallback;
}

/**
 * Apply regex sets to `haystack`; only sets `values[key]` when still null.
 */
export function applyRegexBucketNumber<T extends Record<string, number | null>>(
  haystack: string,
  values: T,
  key: keyof T,
  patterns: RegExp[],
): void {
  if (values[key] != null) return;
  for (const re of patterns) {
    const m = haystack.match(re);
    const n = num(m?.[1]);
    if (n != null) {
      (values as Record<string, number | null>)[key as string] = n;
      return;
    }
  }
}

/** Normalize YES/NO style tokens to boolean; unknown wording → null (do not guess). */
export function normalizeYesNoToken(raw: string): boolean | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  if (/^(yes|y|1|true|available|avail\.?)$/.test(t)) return true;
  if (/^(no|n|0|false|na|n\/a)$/.test(t)) return false;
  if (/^not\s+available$/.test(t) || /^unavailable$/.test(t)) return false;
  return null;
}

export function firstYesNoInPatterns(blob: string, patterns: RegExp[]): boolean | null {
  for (const re of patterns) {
    const m = blob.match(re);
    if (!m?.[1]) continue;
    const v = normalizeYesNoToken(m[1]);
    if (v !== null) return v;
  }
  return null;
}

export function firstIntInPatterns(blob: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = blob.match(re);
    const n = num(m?.[1]);
    if (n != null) return n;
  }
  return null;
}
