import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { loadEnv } from "../../config/env.js";
import { resolveScrapedDataPaths } from "../../config/paths.js";
import { getPrisma } from "../../shared/prisma.js";
import { AppError } from "../../shared/errors.js";
import { authenticate, requireRoles } from "../auth/guards.js";
import { enqueuePdfImport, ensureSchoolStubsFromPdfDir, seedSchoolsFromJson } from "./ingest.service.js";

const runBody = z.object({
  force: z.boolean().optional(),
  seedOnly: z.boolean().optional(),
});

export const registerImportRoutes: FastifyPluginAsync = async (app) => {
  const env = loadEnv();

  app.post(
    "/import/run",
    { preHandler: [authenticate, requireRoles("super_admin", "founder", "analyst")] },
    async (request, reply) => {
      const body = runBody.parse(request.body ?? {});
      let paths;
      try {
        paths = resolveScrapedDataPaths(env);
      } catch (e) {
        throw new AppError(
          "CONFIG",
          e instanceof Error ? e.message : "Could not resolve scraped data paths",
          500,
        );
      }

      if (body.seedOnly) {
        const stubs = await ensureSchoolStubsFromPdfDir(paths, paths.repoRoot);
        const n = await seedSchoolsFromJson(paths, paths.repoRoot);
        return { ok: true, seededFromJson: n, stubsFromPdf: stubs };
      }

      const { jobId } = await enqueuePdfImport({
        paths,
        repoRoot: paths.repoRoot,
        force: body.force,
      });
      return reply.code(202).send({ accepted: true, jobId });
    },
  );

  app.get(
    "/import/jobs/:jobId",
    { preHandler: [authenticate, requireRoles("super_admin", "founder", "analyst", "viewer")] },
    async (request) => {
      const { jobId } = request.params as { jobId: string };
      const prisma = getPrisma();
      const job = await prisma.importJob.findUnique({
        where: { id: jobId },
        include: {
          errors: { orderBy: { createdAt: "desc" }, take: 100 },
        },
      });
      if (!job) throw new AppError("NOT_FOUND", "Import job not found", 404);
      return job;
    },
  );
};
