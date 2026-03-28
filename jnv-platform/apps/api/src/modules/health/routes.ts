import type { FastifyPluginAsync } from "fastify";
import { resolveScrapedDataPaths } from "../../config/paths.js";
import { loadEnv } from "../../config/env.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({ ok: true, service: "jnv-api" }));

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
