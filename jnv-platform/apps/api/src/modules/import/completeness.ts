import {
  computeProfileCompletenessFromSnapshot,
  type ProfileCompletenessSnapshot,
} from "../analytics/derived-metrics.js";

/** 0–100 completeness from a normalized profile snapshot (same as analytics helper). */
export function calculateCompletenessFromSnapshot(snap: ProfileCompletenessSnapshot): number {
  return computeProfileCompletenessFromSnapshot(snap);
}
