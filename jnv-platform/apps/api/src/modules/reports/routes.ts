import type { FastifyPluginAsync } from "fastify";
import { getPrisma } from "../../shared/prisma.js";
import { authenticate, requireRoles } from "../auth/guards.js";

/**
 * Lightweight CSV export for portfolio review (contract-friendly shape).
 */
export const registerReportsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/reports/schools.csv",
    { preHandler: [authenticate, requireRoles("super_admin", "founder", "analyst")] },
    async (_request, reply) => {
      const prisma = getPrisma();
      const rows = await prisma.school.findMany({
        select: {
          udise: true,
          schoolName: true,
          geographicState: true,
          geographicDistrict: true,
          totalStudents: true,
          parsingStatus: true,
          pipelineStatus: true,
          profileCompletenessPct: true,
        },
        orderBy: { udise: "asc" },
        take: 5000,
      });
      const header = [
        "udise",
        "schoolName",
        "state",
        "district",
        "totalStudents",
        "parsingStatus",
        "pipelineStatus",
        "profileCompletenessPct",
      ].join(",");
      const lines = rows.map((r) =>
        [
          r.udise,
          csvEscape(r.schoolName),
          csvEscape(r.geographicState ?? ""),
          csvEscape(r.geographicDistrict ?? ""),
          r.totalStudents ?? "",
          r.parsingStatus,
          r.pipelineStatus,
          r.profileCompletenessPct ?? "",
        ].join(","),
      );
      const csv = [header, ...lines].join("\n");
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="schools-export.csv"')
        .send(csv);
    },
  );
};

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
