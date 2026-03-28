import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const REGION_DEFS = [
  { code: "RO-1", name: "Bhopal", description: "Madhya Pradesh, Chhattisgarh, Odisha" },
  { code: "RO-2", name: "Patna", description: "Bihar, Jharkhand, West Bengal" },
  { code: "RO-3", name: "Lucknow", description: "Uttar Pradesh, Uttarakhand" },
  { code: "RO-4", name: "Jaipur", description: "Rajasthan, Haryana, Delhi, Punjab" },
  { code: "RO-5", name: "Chandigarh", description: "Himachal Pradesh, J&K, Ladakh" },
  { code: "RO-6", name: "Shillong", description: "North-East states" },
  { code: "RO-7", name: "Hyderabad", description: "Telangana, Andhra Pradesh, Karnataka" },
  { code: "RO-8", name: "Pune", description: "Maharashtra, Goa, Gujarat, Daman & Diu" },
] as const;

const ROLE_NAMES = ["super_admin", "founder", "analyst", "viewer"] as const;

async function main() {
  for (const r of REGION_DEFS) {
    await prisma.regionOffice.upsert({
      where: { code: r.code },
      create: { code: r.code, name: r.name, description: r.description },
      update: { name: r.name, description: r.description },
    });
  }

  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({
      where: { name },
      create: { name, description: name },
      update: {},
    });
  }

  const defaultPassword = process.env.SEED_FOUNDER_PASSWORD ?? "change-me-in-prod";
  const rollcode = process.env.SEED_FOUNDER_ROLLCODE ?? "founder";
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

  console.log("Seed OK. Login rollcode:", rollcode, "(set SEED_FOUNDER_PASSWORD in env to override default)");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
