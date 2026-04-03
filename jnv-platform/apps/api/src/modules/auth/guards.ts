import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../shared/errors.js";
import { getPrisma } from "../../shared/prisma.js";

export type JwtPayload = {
  sub: string;
  rollcode: string;
  roles: string[];
};

declare module "fastify" {
  interface FastifyRequest {
    founder?: { id: string; rollcode: string; roles: string[] };
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }
  try {
    await request.jwtVerify<JwtPayload>();
    const payload = request.user as JwtPayload;
    const prisma = getPrisma();
    const user = await prisma.founderUser.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.isActive) {
      throw new AppError("UNAUTHORIZED", "Invalid session", 401);
    }
    request.founder = {
      id: user.id,
      rollcode: user.rollcode,
      roles: user.roles.map((r) => r.role.name),
    };
  } catch {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }
}

export function requireRoles(...allowed: string[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const roles = request.founder?.roles ?? [];
    if (allowed.some((a) => roles.includes(a) || roles.includes("super_admin"))) return;
    throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
  };
}
