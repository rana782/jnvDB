import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../../config/env.js";
import { resolveScrapedDataPaths } from "../../config/paths.js";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { authenticate, requireRoles } from "../auth/guards.js";
import {
  compareSchoolsCanonical,
  getSchoolCanonical,
  getSchoolDetailApi,
  getSchoolDetailRow,
  listSchools,
  patchManualFields,
  patchSchoolStatus,
  schoolFilterSchema,
  upsertNote,
} from "./schools.service.js";
import { getPrisma } from "../../shared/prisma.js";
import { AppError } from "../../shared/errors.js";
import { pipelineStatusSchema } from "../../shared/pipeline-status.js";

/** PDF paths may be stored relative to monorepo root (`jnv-platform/tools/...`) while `repoRoot` is `jnv-platform`; try fallbacks. */
function resolveExistingPdfAbsolute(repoRoot: string | undefined, rel: string): string | null {
  const normalized = rel.trim().replace(/\//g, path.sep);
  if (!normalized) return null;
  if (path.isAbsolute(normalized)) {
    return fs.existsSync(normalized) ? normalized : null;
  }
  const candidates: string[] = [];
  if (repoRoot) {
    candidates.push(path.join(repoRoot, normalized));
    if (normalized.startsWith(`jnv-platform${path.sep}`)) {
      candidates.push(path.join(repoRoot, normalized.slice(`jnv-platform${path.sep}`.length)));
    }
    candidates.push(path.join(repoRoot, "jnv-platform", normalized));
  }
  candidates.push(path.resolve(normalized));
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function audit(
  actorId: string | undefined,
  action: string,
  entityId: string,
  diff: unknown,
  request: { ip: string; headers: { "user-agent"?: string } },
) {
  if (!actorId) return;
  const prisma = getPrisma();
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entityType: "School",
      entityId,
      diff: diff as object,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    },
  });
}

export const registerSchoolRoutes: FastifyPluginAsync = async (app) => {
  const env = loadEnv();

  app.get("/schools", async (request) => {
    const pagination = paginationQuerySchema.parse(request.query);
    const filters = schoolFilterSchema.parse(request.query);
    return listSchools(pagination, filters);
  });

  app.get("/schools/compare", async (request) => {
    const q = request.query as Record<string, string | string[] | undefined>;
    const raw = q.u;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const udises = list.flatMap((s) => s.split(",").map((x) => x.trim()).filter(Boolean));
    return compareSchoolsCanonical(udises);
  });

  app.get("/schools/:udise", async (request) => {
    const { udise } = request.params as { udise: string };
    return getSchoolDetailApi(udise);
  });

  app.get("/schools/:udise/charts", async (request) => {
    const { udise } = request.params as { udise: string };
    const canonical = await getSchoolCanonical(udise);
    return {
      chartSeries: canonical.chartSeries,
      sections: canonical.sections,
    };
  });

  app.get("/schools/:udise/pdf", async (request, reply) => {
    const { udise } = request.params as { udise: string };
    const school = await getSchoolDetailRow(udise);
    if (!school.pdfRelativePath) throw new AppError("NOT_FOUND", "No PDF path", 404);
    let paths;
    try {
      paths = resolveScrapedDataPaths(env);
    } catch {
      throw new AppError("CONFIG", "Data paths not configured", 500);
    }
    const abs = resolveExistingPdfAbsolute(paths.repoRoot, school.pdfRelativePath);
    if (!abs) throw new AppError("NOT_FOUND", "PDF file missing on disk", 404);
    return reply.type("application/pdf").send(fs.createReadStream(abs));
  });

  app.patch(
    "/schools/:udise/status",
    { preHandler: [authenticate, requireRoles("founder", "super_admin", "analyst")] },
    async (request) => {
      const { udise } = request.params as { udise: string };
      const body = z.object({ pipelineStatus: pipelineStatusSchema }).parse(request.body);
      const out = await patchSchoolStatus(udise, body, request.founder!.id);
      await audit(request.founder!.id, "school.status", udise, body, request);
      return out;
    },
  );

  app.patch(
    "/schools/:udise/manual-fields",
    { preHandler: [authenticate, requireRoles("founder", "super_admin", "analyst")] },
    async (request) => {
      const { udise } = request.params as { udise: string };
      const body = z
        .object({
          manualRevenueOccupancy: z.number().optional(),
          manualWashPrice: z.number().optional(),
          manualWashesPerStudentMonth: z.number().optional(),
        })
        .parse(request.body);
      const out = await patchManualFields(udise, body);
      await audit(request.founder!.id, "school.manual", udise, body, request);
      return out;
    },
  );

  app.patch(
    "/schools/:udise/notes",
    { preHandler: [authenticate, requireRoles("founder", "super_admin", "analyst")] },
    async (request) => {
      const { udise } = request.params as { udise: string };
      const body = z
        .object({
          comments: z.string().optional(),
          waterReliability: z.string().optional(),
          electricityReliability: z.string().optional(),
          spaceAvailable: z.string().optional(),
          staffSupport: z.string().optional(),
          followUpAt: z.string().optional(),
        })
        .parse(request.body);
      const out = await upsertNote(udise, body, request.founder?.id);
      await audit(request.founder!.id, "school.notes", udise, body, request);
      return out;
    },
  );
};
