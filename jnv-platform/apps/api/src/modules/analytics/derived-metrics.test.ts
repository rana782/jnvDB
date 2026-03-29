import { describe, expect, it } from "vitest";
import {
  PROFILE_COMPLETENESS_WEIGHTS,
  computeProfileCompletenessFromSnapshot,
  type ProfileCompletenessSnapshot,
} from "./derived-metrics.js";

const emptySnap = (): ProfileCompletenessSnapshot => ({
  totalStudents: null,
  totalBoys: null,
  totalGirls: null,
  waterAvailable: null,
  electricityAvailable: null,
  internetAvailable: null,
  solarAvailable: null,
  playgroundAvailable: null,
  libraryAvailable: null,
  enrolmentSocial: [],
  enrolmentMinority: [],
  enrolmentOthers: [],
  enrolmentAge: [],
  infra: null,
  digital: null,
});

describe("computeProfileCompletenessFromSnapshot", () => {
  it("returns 0 when nothing is filled", () => {
    expect(computeProfileCompletenessFromSnapshot(emptySnap())).toBe(0);
  });

  it("sums configured weights when all sections qualify", () => {
    const s = emptySnap();
    s.enrolmentSocial = [{ total: 10, boys: null, girls: null }];
    s.enrolmentMinority = [{ total: 1, boys: null, girls: null }];
    s.enrolmentOthers = [{ total: 2, boys: null, girls: null }];
    s.enrolmentAge = [{ total: 3, boys: null, girls: null }];
    s.totalStudents = 100;
    s.waterAvailable = true;
    s.electricityAvailable = true;
    s.infra = {
      puccaBuilding: true,
      functionalToiletsB: null,
      functionalToiletsG: null,
      rampsAvailable: null,
      medicalCheckup: null,
    };
    s.digital = { smartClassTv: 1, laptops: null, desktops: null, tablets: null, printers: null };
    const sum =
      PROFILE_COMPLETENESS_WEIGHTS.social +
      PROFILE_COMPLETENESS_WEIGHTS.minority +
      PROFILE_COMPLETENESS_WEIGHTS.others +
      PROFILE_COMPLETENESS_WEIGHTS.age +
      PROFILE_COMPLETENESS_WEIGHTS.studentTotals +
      PROFILE_COMPLETENESS_WEIGHTS.infra +
      PROFILE_COMPLETENESS_WEIGHTS.digital;
    expect(sum).toBe(100);
    expect(computeProfileCompletenessFromSnapshot(s)).toBe(100);
  });

  it("awards student totals from boys+girls when totalStudents is null", () => {
    const s = emptySnap();
    s.totalBoys = 5;
    s.totalGirls = 6;
    expect(computeProfileCompletenessFromSnapshot(s)).toBe(PROFILE_COMPLETENESS_WEIGHTS.studentTotals);
  });

  it("awards infra from two school-level facility flags when SchoolInfra is empty", () => {
    const s = emptySnap();
    s.waterAvailable = true;
    s.internetAvailable = false;
    expect(computeProfileCompletenessFromSnapshot(s)).toBe(PROFILE_COMPLETENESS_WEIGHTS.infra);
  });
});
