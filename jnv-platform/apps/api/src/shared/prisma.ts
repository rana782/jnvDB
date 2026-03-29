import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../config/env.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  loadEnv();
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await globalForPrisma.prisma?.$disconnect().catch(() => {});
  globalForPrisma.prisma = undefined;
}

/** Test-only: next getPrisma() creates a new client (e.g. after DATABASE_URL change). */
export async function resetPrismaForTests(): Promise<void> {
  await disconnectPrisma();
}
