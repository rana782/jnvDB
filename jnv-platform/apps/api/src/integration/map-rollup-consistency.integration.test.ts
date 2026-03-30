/**
 * Map rollups vs school rows after import (state totals, district sums).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearEnvCacheForTests } from "../config/env.js";
import { mapDistrictAggregates, mapStateAggregates } from "../modules/map/map.service.js";
import { getPrisma, resetPrismaForTests } from "../shared/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..", "..");
const DEV_DB_PATH = path.join(API_ROOT, "prisma", "dev.db");
const DEV_DB_URL = `file:${DEV_DB_PATH.replace(/\\/g, "/")}`;

let savedDatabaseUrl: string | undefined;

describe("Map rollup consistency (dev.db)", () => {
  beforeAll(async () => {
    savedDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = DEV_DB_URL;
    clearEnvCacheForTests();
    await resetPrismaForTests();
  });

  afterAll(async () => {
    process.env.DATABASE_URL = savedDatabaseUrl;
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    clearEnvCacheForTests();
    await resetPrismaForTests();
  });

  it("state school counts sum to total schools; each state districts sum to state schoolCount", async () => {
    if (!fs.existsSync(DEV_DB_PATH)) {
      return;
    }
    const prisma = getPrisma();
    const n = await prisma.school.count();
    if (n === 0) {
      return;
    }

    const agg = await mapStateAggregates({}, "jnv_count");
    expect(agg.meta.totalSchools).toBe(n);
    const sumStates = agg.states.reduce((a, s) => a + s.schoolCount, 0);
    expect(sumStates).toBe(n);

    for (const st of agg.states) {
      const stateName = st.name;
      if (!stateName) continue;
      const dist = await mapDistrictAggregates(stateName, {});
      const sumD = dist.districts.reduce((a, d) => a + d.schoolCount, 0);
      expect(sumD, `districts for ${stateName} should sum to state schoolCount`).toBe(st.schoolCount);
    }
  });
});
