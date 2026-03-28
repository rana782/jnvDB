import type { FastifyPluginAsync } from "fastify";
import { getPrisma } from "../../shared/prisma.js";
import { offsetLimit, paginationQuerySchema } from "../../shared/pagination.js";
import { authenticate, requireRoles } from "../auth/guards.js";

export const registerAuditRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/audit",
    { preHandler: [authenticate, requireRoles("super_admin", "founder")] },
    async (request) => {
      const pagination = paginationQuerySchema.parse(request.query);
      const { take, skip } = offsetLimit(pagination);
      const prisma = getPrisma();
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take,
          skip,
          include: { actor: { select: { rollcode: true, displayName: true } } },
        }),
        prisma.auditLog.count(),
      ]);
      return { items, total, page: pagination.page, pageSize: pagination.pageSize };
    },
  );
};
