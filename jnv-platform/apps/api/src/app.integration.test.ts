import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("buildApp", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  afterAll(async () => {
    await app?.close();
  });

  it("serves health (SQLite default when DATABASE_URL unset)", async () => {
    app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("serves dashboard progress JSON", async () => {
    const a = await buildApp();
    try {
      const res = await a.inject({ method: "GET", url: "/api/dashboard/progress" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { totalSchools: number; pipeline: object };
      expect(typeof body.totalSchools).toBe("number");
      expect(body.pipeline).toBeDefined();
    } finally {
      await a.close();
    }
  });
});
