import type { FastifyPluginAsync } from "fastify";
import { resolveScrapedDataPaths } from "../../config/paths.js";
import { loadEnv } from "../../config/env.js";
import { getPrisma } from "../../shared/prisma.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async (_req, reply) => {
    try {
      await getPrisma().$queryRawUnsafe("SELECT 1");
      return {
        ok: true,
        service: "jnv-api",
        status: "ok",
        db: "connected",
      };
    } catch (e) {
      return reply.code(503).send({
        ok: false,
        service: "jnv-api",
        status: "error",
        db: "disconnected",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.get("/health/data-paths", async () => {
    const env = loadEnv();
    try {
      const paths = resolveScrapedDataPaths(env);
      return { ok: true, paths };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
};
