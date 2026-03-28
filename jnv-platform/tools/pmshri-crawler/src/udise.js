/**
 * UDISE school codes are 11 digits; ArcGIS/API may return them without leading zeros.
 * @param {string|number} code
 * @returns {string}
 */
export function normalizeUdise(code) {
  const s = String(code ?? "").trim();
  if (!/^\d+$/.test(s)) return s;
  return s.length >= 11 ? s : s.padStart(11, "0");
}
