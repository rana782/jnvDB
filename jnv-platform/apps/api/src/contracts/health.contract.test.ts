import { describe, expect, it } from "vitest";
import { z } from "zod";

const healthSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  status: z.literal("ok"),
  db: z.literal("connected"),
});

describe("health contract", () => {
  it("parses /api/health payload", () => {
    const body = {
      ok: true as const,
      service: "jnv-api",
      status: "ok" as const,
      db: "connected" as const,
    };
    expect(() => healthSchema.parse(body)).not.toThrow();
  });
});
