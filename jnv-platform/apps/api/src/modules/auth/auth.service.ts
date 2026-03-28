import argon2 from "argon2";
import { getPrisma } from "../../shared/prisma.js";
import { AppError } from "../../shared/errors.js";

export async function verifyLogin(rollcode: string, password: string) {
  const prisma = getPrisma();
  const user = await prisma.founderUser.findUnique({
    where: { rollcode: rollcode.trim() },
    include: { roles: { include: { role: true } } },
  });
  if (!user || !user.isActive) {
    throw new AppError("AUTH_FAILED", "Invalid rollcode or password", 401);
  }
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw new AppError("AUTH_FAILED", "Invalid rollcode or password", 401);
  return {
    id: user.id,
    rollcode: user.rollcode,
    displayName: user.displayName,
    roles: user.roles.map((r) => r.role.name),
  };
}

export async function hashPassword(password: string) {
  return argon2.hash(password);
}
