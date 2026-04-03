import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { verifyLogin } from "./auth.service.js";
import { authenticate, type JwtPayload } from "./guards.js";

const loginBody = z.object({
  rollcode: z.string().min(1),
  password: z.string().min(1),
});

export const registerAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", async (request, reply) => {
    const body = loginBody.parse(request.body);
    const user = await verifyLogin(body.rollcode, body.password);
    const token = await reply.jwtSign({
      sub: user.id,
      rollcode: user.rollcode,
      roles: user.roles,
    } satisfies JwtPayload);

    return {
      token,
      user: {
        id: user.id,
        rollcode: user.rollcode,
        roles: user.roles,
      },
    };
  });

  app.post("/logout", async () => {
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
