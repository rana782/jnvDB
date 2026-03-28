import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { loadEnv } from "./config/env.js";
import { logger } from "./shared/logger.js";
import { isAppError } from "./shared/errors.js";
import { healthRoutes } from "./modules/health/routes.js";
import { registerSchoolRoutes } from "./modules/schools/routes.js";
import { registerImportRoutes } from "./modules/import/routes.js";
import { registerAnalyticsRoutes } from "./modules/analytics/routes.js";
import { registerMapRoutes } from "./modules/map/routes.js";
import { registerReportsRoutes } from "./modules/reports/routes.js";
import { registerAuditRoutes } from "./modules/audit/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerJwtCookieHook } from "./modules/auth/jwt-cookie.js";
import { registerGeoRoutes } from "./modules/geo/routes.js";
import { disconnectPrisma } from "./shared/prisma.js";

export async function buildApp() {
  const env = loadEnv();

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.JWT_SECRET,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: "7d" },
    cookie: {
      cookieName: "jnv_token",
      signed: false,
    },
  });

  registerJwtCookieHook(app);

  app.setErrorHandler((err: unknown, request, reply) => {
    if (isAppError(err)) {
      return reply.status(err.statusCode).send({
        code: err.code,
        message: err.message,
        details: err.details ?? null,
      });
    }
    request.log.error(err);
    return reply.status(500).send({
      code: "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "Internal server error"
          : err instanceof Error
            ? err.message
            : String(err),
      details: null,
    });
  });

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(registerAuthRoutes, { prefix: "/api/auth" });
  await app.register(registerSchoolRoutes, { prefix: "/api" });
  await app.register(registerImportRoutes, { prefix: "/api" });
  await app.register(registerAnalyticsRoutes, { prefix: "/api" });
  await app.register(registerMapRoutes, { prefix: "/api" });
  await app.register(registerGeoRoutes, { prefix: "/api" });
  await app.register(registerReportsRoutes, { prefix: "/api" });
  await app.register(registerAuditRoutes, { prefix: "/api" });

  app.addHook("onClose", async () => {
    await disconnectPrisma();
  });

  return app;
}
