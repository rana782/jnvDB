import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { loadEnv } from "../../config/env.js";
import { verifyLogin } from "./auth.service.js";
import { authenticate, type JwtPayload } from "./guards.js";

const loginBody = z.object({
  rollcode: z.string().min(1),
  password: z.string().min(1),
});

export const registerAuthRoutes: FastifyPluginAsync = async (app) => {
  const env = loadEnv();

  app.post("/login", async (request, reply) => {
    const body = loginBody.parse(request.body);
    const user = await verifyLogin(body.rollcode, body.password);
    const token = await reply.jwtSign({
      sub: user.id,
      rollcode: user.rollcode,
      roles: user.roles,
    } satisfies JwtPayload);

    // In production the frontend and API are typically different HTTPS origins.
    // Browsers will reject cookies for cross-site requests unless:
    // - `Secure` is true
    // - `SameSite=None`
    const isProdCookie = env.NODE_ENV === "production" || env.COOKIE_SECURE;

    reply.setCookie("jnv_token", token, {
      path: "/",
      httpOnly: true,
      secure: isProdCookie,
      // Frontend (Vercel) and API (Render) are different origins.
      // For cross-site XHR/fetch, cookies generally require SameSite=None (and Secure=true).
      sameSite: isProdCookie ? "none" : "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return { user: { rollcode: user.rollcode, displayName: user.displayName, roles: user.roles } };
  });

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie("jnv_token", { path: "/" });
    return { ok: true };
  });

  app.get(
    "/me",
    { preHandler: [authenticate] },
    async (request) => {
      return { user: request.founder };
    },
  );
};
