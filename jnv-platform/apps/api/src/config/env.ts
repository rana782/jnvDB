import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().optional(),
  JNV_DATA_ROOT: z.string().optional(),
  JWT_SECRET: z.string().min(16).default("dev-jwt-secret-change-me-32chars"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment", parsed.error.flatten());
    throw new Error("Invalid environment variables");
  }
  const DATABASE_URL = parsed.data.DATABASE_URL?.trim() || "file:./dev.db";
  process.env.DATABASE_URL = DATABASE_URL;
  cached = { ...parsed.data, DATABASE_URL };
  return cached;
}
