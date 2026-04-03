import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import {
  INDIAN_STATES_FOR_SEED,
  NVS_REGION_OFFICES,
} from "../src/data/nvs-states-regions.js";
import { effectiveDisplayState } from "../src/modules/map/map-aggregate-core.js";

function normalizeStateLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/nct\s+of\s+/gi, "")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const prisma = new PrismaClient();

const ROLE_NAMES = ["super_admin", "founder", "analyst", "viewer"] as const;

async function main() {
  // One-time data fix: pipeline enum value renamed UNREVIEWED → NOT_REVIEWED (SQLite stores enum as TEXT).
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE School SET pipelineStatus = 'NOT_REVIEWED' WHERE pipelineStatus = 'UNREVIEWED'`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE SchoolProgress SET fromStatus = 'NOT_REVIEWED' WHERE fromStatus = 'UNREVIEWED'`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE SchoolProgress SET toStatus = 'NOT_REVIEWED' WHERE toStatus = 'UNREVIEWED'`,
    );
  } catch (e) {
    console.warn("Pipeline enum migration SQL skipped or failed (ok on fresh DB):", e);
  }

  for (const r of NVS_REGION_OFFICES) {
    await prisma.regionOffice.upsert({
      where: { code: r.code },
      create: { code: r.code, name: r.name, description: r.description },
      update: { name: r.name, description: r.description },
    });
  }

  const regionsByCode = Object.fromEntries(
    (await prisma.regionOffice.findMany({ select: { id: true, code: true } })).map((x) => [x.code, x.id]),
  );

  for (const row of INDIAN_STATES_FOR_SEED) {
    const normalizedName = normalizeStateLabel(row.name);
    const regionId = regionsByCode[row.regionCode] ?? null;
    await prisma.state.upsert({
      where: { normalizedName },
      create: { name: row.name, normalizedName, regionId },
      update: { name: row.name, regionId },
    });
  }

  const states = await prisma.state.findMany({ select: { id: true, name: true, normalizedName: true } });
  const exactByNorm = new Map(states.map((s) => [normalizeStateLabel(s.normalizedName), s.id]));
  for (const s of states) {
    exactByNorm.set(normalizeStateLabel(s.name), s.id);
  }

  const schools = await prisma.school.findMany({
    select: { udise: true, geographicState: true, apiStateName: true, stateId: true },
  });
  let linked = 0;
  for (const sch of schools) {
    const label = effectiveDisplayState({
      geographicState: sch.geographicState,
      apiStateName: sch.apiStateName,
    });
    if (!label || label === "Unknown") continue;
    const n = normalizeStateLabel(label);
    let stateId = exactByNorm.get(n) ?? null;
    if (!stateId) {
      for (const st of states) {
        const sn = normalizeStateLabel(st.name);
        if (sn.length >= 3 && (n.includes(sn) || sn.includes(n))) {
          stateId = st.id;
          break;
        }
      }
    }
    if (stateId && stateId !== sch.stateId) {
      await prisma.school.update({ where: { udise: sch.udise }, data: { stateId } });
      linked++;
    }
  }
  console.log("States seeded:", states.length, "| Schools linked / corrected to State:", linked);

  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({
      where: { name },
      create: { name, description: name },
      update: {},
    });
  }

  const isCi = process.env.GITHUB_ACTIONS === "true";
  const passwordFromEnv =
    (process.env.SEED_ADMIN_PASSWORD ?? process.env.SEED_FOUNDER_PASSWORD ?? "").trim();
  const defaultPassword = passwordFromEnv || (isCi ? "" : "change-me-in-prod");
  if (isCi && !defaultPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD or SEED_FOUNDER_PASSWORD must be set (GitHub Actions).",
    );
  }
  const rollcode =
    (process.env.SEED_ADMIN_ROLLCODE ?? process.env.SEED_FOUNDER_ROLLCODE ?? "").trim() ||
    "founder";
  const hash = await argon2.hash(defaultPassword);

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "super_admin" } });
  const founderRole = await prisma.role.findUniqueOrThrow({ where: { name: "founder" } });

  const user = await prisma.founderUser.upsert({
    where: { rollcode },
    create: {
      rollcode,
      passwordHash: hash,
      displayName: "Seed founder",
      isActive: true,
    },
    update: { passwordHash: hash, isActive: true },
  });

  await prisma.founderUserRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    create: { userId: user.id, roleId: superAdminRole.id },
    update: {},
  });
  await prisma.founderUserRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: founderRole.id } },
    create: { userId: user.id, roleId: founderRole.id },
    update: {},
  });

  const verified = await prisma.founderUser.findUnique({
    where: { rollcode },
    select: { id: true, passwordHash: true },
  });
  if (!verified?.passwordHash?.startsWith("$argon")) {
    throw new Error("Seed validation failed: expected argon2 passwordHash on founder user.");
  }
  const dupes = await prisma.founderUser.count({ where: { rollcode } });
  if (dupes !== 1) {
    throw new Error(`Seed validation failed: expected one row for rollcode, got ${dupes}.`);
  }

  console.log(
    "Seed OK. Founder login rollcode configured (password from env only; use SEED_ADMIN_PASSWORD in GitHub Actions).",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
