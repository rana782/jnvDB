import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../config/env.js";
import { logger } from "./logger.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Host / db / user for logs — password and query string never included. */
export function redactedDatabaseTarget(databaseUrl: string): string {
  try {
    const normalized = databaseUrl.trim().replace(/^postgres(ql)?:/i, "http:");
    const u = new URL(normalized);
    const host = u.hostname + (u.port ? `:${u.port}` : "");
    const db = (u.pathname || "/").replace(/^\//, "").split("?")[0] || "postgres";
    const user = u.username ? `${decodeURIComponent(u.username)}@` : "";
    return `postgresql://${user}${host}/${db}`;
  } catch {
    return "(could not parse DATABASE_URL for logging)";
  }
}

export function logDatabaseTarget(): void {
  const url = process.env.DATABASE_URL ?? "";
  logger.info(`[db] ${redactedDatabaseTarget(url)}`);
}

/** Fail fast at boot if Prisma cannot reach the database. */
export async function assertDatabaseReachable(): Promise<void> {
  const prisma = getPrisma();
  await prisma.$connect();
  await prisma.$queryRawUnsafe("SELECT 1");
}

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
