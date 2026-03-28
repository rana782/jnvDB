export function normalizeUdise(code: string | null | undefined): string {
  const s = String(code ?? "").trim();
  if (!/^\d+$/.test(s)) return s;
  return s.length >= 11 ? s : s.padStart(11, "0");
}
