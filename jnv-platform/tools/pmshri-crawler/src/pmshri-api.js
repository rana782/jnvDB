import { normalizeUdise } from "./udise.js";

const API_BASE = "https://pmshri.education.gov.in/apipmshridashboard/api/v1";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} udise
 * @returns {Promise<object|null>}
 */
export async function fetchSchoolDetails(udise) {
  const u = normalizeUdise(udise);
  const url = `${API_BASE}/school/details/${encodeURIComponent(u)}`;
  const attempts = Number(process.env.API_RETRY_ATTEMPTS || 4);
  const baseMs = Number(process.env.API_RETRY_BASE_MS || 2500);

  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (i < attempts - 1) await sleep(baseMs * (i + 1));
      continue;
    }
    const j = await res.json();
    if (j.status && j.data) return j.data;
    if (i < attempts - 1) await sleep(baseMs * (i + 1));
  }
  return null;
}

/**
 * PM SHRI "Report Card" PDF: API returns JSON { status, data } where `data` is base64-encoded PDF bytes.
 * @param {string} udise
 * @returns {Promise<Buffer|null>}
 */
export async function fetchReportCardPdfBytes(udise) {
  const u = normalizeUdise(udise);
  const url = `${API_BASE}/school/fetchSchoolReportCard/${encodeURIComponent(u)}`;
  const attempts = Number(process.env.API_RETRY_ATTEMPTS || 4);
  const baseMs = Number(process.env.API_RETRY_BASE_MS || 2500);

  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (i < attempts - 1) await sleep(baseMs * (i + 1));
      continue;
    }
    const j = await res.json();
    if (j.status && typeof j.data === "string" && j.data.length > 100) {
      try {
        const buf = Buffer.from(j.data, "base64");
        if (buf.length > 1024 && buf.subarray(0, 4).toString() === "%PDF") return buf;
      } catch {
        /* invalid base64 */
      }
    }
    if (i < attempts - 1) await sleep(baseMs * (i + 1));
  }
  return null;
}
