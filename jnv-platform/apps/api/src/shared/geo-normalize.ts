/** Normalize state labels for matching scrape / PDF / UDISE text to reference `State` rows. */
export function normalizeStateLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/nct\s+of\s+/gi, "")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical display casing for state labels (case-insensitive source -> stable output). */
export function canonicalizeStateDisplay(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  return v
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOf\b/g, "of")
    .trim();
}
