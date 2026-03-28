import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { mapAggregates } from "./map.service.js";

export const registerMapRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/map", async (request) => {
    const q = z
      .object({
        water: z.enum(["true", "false"]).optional(),
        electricity: z.enum(["true", "false"]).optional(),
        internet: z.enum(["true", "false"]).optional(),
        pipelineStatus: z.string().optional(),
      })
      .parse(request.query);
    return mapAggregates({
      water: q.water === "true" ? true : q.water === "false" ? false : undefined,
      electricity: q.electricity === "true" ? true : q.electricity === "false" ? false : undefined,
      internet: q.internet === "true" ? true : q.internet === "false" ? false : undefined,
      pipelineStatus: q.pipelineStatus,
    });
  });
};
