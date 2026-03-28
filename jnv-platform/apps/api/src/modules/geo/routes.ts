import type { FastifyPluginAsync } from "fastify";
import { getPrisma } from "../../shared/prisma.js";
import { offsetLimit, paginationQuerySchema } from "../../shared/pagination.js";
import { schoolListInclude, toSchoolListItem } from "../schools/school.dto.js";

export const registerGeoRoutes: FastifyPluginAsync = async (app) => {
  app.get("/regions", async () => {
    const prisma = getPrisma();
    return prisma.regionOffice.findMany({ orderBy: { code: "asc" } });
  });

  app.get("/regions/:regionId/schools", async (request) => {
    const { regionId } = request.params as { regionId: string };
    const pagination = paginationQuerySchema.parse(request.query);
    const { take, skip } = offsetLimit(pagination);
    const prisma = getPrisma();
    const where = { state: { regionId } };
    const [rows, total] = await Promise.all([
      prisma.school.findMany({
        where,
        take,
        skip,
        orderBy: { schoolName: "asc" },
        include: schoolListInclude,
      }),
      prisma.school.count({ where }),
    ]);
    return {
      items: rows.map(toSchoolListItem),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  });

  app.get("/states", async () => {
    const prisma = getPrisma();
    return prisma.state.findMany({
      include: { region: true },
      orderBy: { name: "asc" },
    });
  });

  app.get("/states/:stateId/districts", async (request) => {
    const { stateId } = request.params as { stateId: string };
    const prisma = getPrisma();
    return prisma.district.findMany({
      where: { stateId },
      orderBy: { name: "asc" },
    });
  });

  app.get("/districts/:districtId/schools", async (request) => {
    const { districtId } = request.params as { districtId: string };
    const pagination = paginationQuerySchema.parse(request.query);
    const { take, skip } = offsetLimit(pagination);
    const prisma = getPrisma();
    const where = { districtId };
    const [rows, total] = await Promise.all([
      prisma.school.findMany({
        where,
        take,
        skip,
        orderBy: { schoolName: "asc" },
        include: schoolListInclude,
      }),
      prisma.school.count({ where }),
    ]);
    return {
      items: rows.map(toSchoolListItem),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  });
};
