/**
 * NVS region offices + Indian states/UTs for seeding and dashboard region inference
 * when `School.stateId` is not set but `effectiveDisplayState` matches a known state.
 */
import { normalizeStateLabel } from "../shared/geo-normalize.js";

export const NVS_REGION_OFFICES = [
  { code: "RO-1", name: "Bhopal", description: "Madhya Pradesh, Chhattisgarh, Odisha" },
  { code: "RO-2", name: "Patna", description: "Bihar, Jharkhand, West Bengal" },
  { code: "RO-3", name: "Lucknow", description: "Uttar Pradesh, Uttarakhand" },
  { code: "RO-4", name: "Jaipur", description: "Rajasthan, Haryana, Delhi, Punjab" },
  { code: "RO-5", name: "Chandigarh", description: "Himachal Pradesh, J&K, Ladakh" },
  { code: "RO-6", name: "Shillong", description: "North-East states" },
  { code: "RO-7", name: "Hyderabad", description: "Telangana, Andhra Pradesh, Karnataka" },
  { code: "RO-8", name: "Pune", description: "Maharashtra, Goa, Gujarat, Daman & Diu" },
] as const;

/** `regionCode` must match `RegionOffice.code` in the database. */
export const INDIAN_STATES_FOR_SEED: { name: string; regionCode: string }[] = [
  { name: "Andhra Pradesh", regionCode: "RO-7" },
  { name: "Arunachal Pradesh", regionCode: "RO-6" },
  { name: "Assam", regionCode: "RO-6" },
  { name: "Bihar", regionCode: "RO-2" },
  { name: "Chhattisgarh", regionCode: "RO-1" },
  { name: "Goa", regionCode: "RO-8" },
  { name: "Gujarat", regionCode: "RO-8" },
  { name: "Haryana", regionCode: "RO-4" },
  { name: "Himachal Pradesh", regionCode: "RO-5" },
  { name: "Jharkhand", regionCode: "RO-2" },
  { name: "Karnataka", regionCode: "RO-7" },
  { name: "Kerala", regionCode: "RO-7" },
  { name: "Madhya Pradesh", regionCode: "RO-1" },
  { name: "Maharashtra", regionCode: "RO-8" },
  { name: "Manipur", regionCode: "RO-6" },
  { name: "Meghalaya", regionCode: "RO-6" },
  { name: "Mizoram", regionCode: "RO-6" },
  { name: "Nagaland", regionCode: "RO-6" },
  { name: "Odisha", regionCode: "RO-1" },
  { name: "Punjab", regionCode: "RO-4" },
  { name: "Rajasthan", regionCode: "RO-4" },
  { name: "Sikkim", regionCode: "RO-6" },
  { name: "Tamil Nadu", regionCode: "RO-7" },
  { name: "Telangana", regionCode: "RO-7" },
  { name: "Tripura", regionCode: "RO-6" },
  { name: "Uttar Pradesh", regionCode: "RO-3" },
  { name: "Uttarakhand", regionCode: "RO-3" },
  { name: "West Bengal", regionCode: "RO-2" },
  { name: "Andaman and Nicobar Islands", regionCode: "RO-6" },
  { name: "Chandigarh", regionCode: "RO-5" },
  { name: "Dadra and Nagar Haveli and Daman and Diu", regionCode: "RO-8" },
  { name: "Delhi", regionCode: "RO-4" },
  { name: "Jammu and Kashmir", regionCode: "RO-5" },
  { name: "Ladakh", regionCode: "RO-5" },
  { name: "Lakshadweep", regionCode: "RO-7" },
  { name: "Puducherry", regionCode: "RO-7" },
];

function regionMeta(code: string): { regionCode: string; regionName: string } {
  const ro = NVS_REGION_OFFICES.find((r) => r.code === code);
  return { regionCode: code, regionName: ro?.name ?? code };
}

/** Map dashboard / map display state label to NVS RO when DB `stateId` is missing. */
export function inferNvsRegionFromDisplayState(displayState: string): {
  regionCode: string;
  regionName: string;
} | null {
  const raw = displayState?.trim();
  if (!raw || raw === "Unknown") return null;
  const n = normalizeStateLabel(raw);
  if (n === "unknown") return null;

  for (const row of INDIAN_STATES_FOR_SEED) {
    const rn = normalizeStateLabel(row.name);
    if (rn === n) return regionMeta(row.regionCode);
  }
  for (const row of INDIAN_STATES_FOR_SEED) {
    const rn = normalizeStateLabel(row.name);
    if (rn.length >= 3 && (n.includes(rn) || rn.includes(n))) return regionMeta(row.regionCode);
  }
  return null;
}
