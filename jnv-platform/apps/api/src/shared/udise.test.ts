import { describe, expect, it } from "vitest";
import { normalizeUdise } from "./udise.js";

describe("normalizeUdise", () => {
  it("trims and preserves 11-digit codes", () => {
    expect(normalizeUdise(" 12345678901 ")).toBe("12345678901");
  });

  it("left-pads numeric codes shorter than 11", () => {
    expect(normalizeUdise("123")).toBe("00000000123");
  });
});
