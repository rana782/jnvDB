import { describe, expect, it } from "vitest";
import { calculateRevenue, scenarioPresets } from "./revenue-calculator.js";

describe("revenue-calculator", () => {
  it("applies defaults and returns rounded totals", () => {
    const r = calculateRevenue({ totalStudents: 100 });
    expect(r.effectiveStudents).toBe(85);
    expect(r.monthlyRevenue).toBeGreaterThan(0);
    expect(r.annualRevenue).toBeGreaterThan(r.monthlyRevenue);
  });

  it("maps legacy occupancyRate to adoption via schema preprocess", () => {
    const r = calculateRevenue({ totalStudents: 100, occupancyRate: 0.5 } as Parameters<
      typeof calculateRevenue
    >[0]);
    expect(r.effectiveStudents).toBe(50);
  });

  it("scenarioPresets scales price and washes", () => {
    const low = scenarioPresets("LOW", { totalStudents: 50 });
    const high = scenarioPresets("HIGH", { totalStudents: 50 });
    expect(high.monthlyRevenue).toBeGreaterThan(low.monthlyRevenue);
  });
});
