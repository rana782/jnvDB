import { describe, expect, it } from "vitest";
import { z } from "zod";

const healthSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
});

describe("health contract", () => {
  it("parses /api/health payload", () => {
    const body = { ok: true as const, service: "jnv-api" };
    expect(() => healthSchema.parse(body)).not.toThrow();
  });
});
