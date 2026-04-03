import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const envDir = path.dirname(fileURLToPath(import.meta.url));
/** Load apps/api/.env so `JNV_DATA_ROOT` matches Prisma CLI and import scripts when running `tsx src/server.ts`. */
loadDotenv({ path: path.join(envDir, "..", "..", ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().optional(),
  JNV_DATA_ROOT: z.string().optional(),
  JWT_SECRET: z.string().min(16).default("dev-jwt-secret-change-me-32chars"),
  /** Vite may be opened as localhost or 127.0.0.1; both must be allowed or the browser blocks credentialed `/api` calls. */
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  /** When true, merge UDISE / school profile / students from the legacy full parser; social buckets always use the dedicated extractor. */
  REPORT_CARD_LEGACY_FULL_PARSE: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === false || v === "") return false;
      if (v === true) return true;
      const t = String(v).trim().toLowerCase();
      return t === "true" || t === "1" || t === "yes";
    }),
  /** When true, run a second forced OCR pass when parsed enrolment/headcount appears empty. */
  REPORT_CARD_OCR_WEAK_RETRY: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === false || v === "") return false;
      if (v === true) return true;
      const t = String(v).trim().toLowerCase();
      return t === "true" || t === "1" || t === "yes";
    }),
  /** When true, POST /api/import/run is rejected. Use one-time static JSON seeding (`jnv_pipeline/import_json_to_postgres.py`) instead of server-side PDF extraction. */
  JNV_DISABLE_PDF_IMPORT: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      // Safe-by-default for deployed environments: disable runtime PDF parsing unless explicitly enabled.
      if (v === undefined || v === "") return true;
      if (v === false) return false;
      if (v === true) return true;
      const t = String(v).trim().toLowerCase();
      return t === "true" || t === "1" || t === "yes";
    }),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Test-only: allow switching DATABASE_URL after first load. */
export function clearEnvCacheForTests(): void {
  cached = null;
}

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment", parsed.error.flatten());
    throw new Error("Invalid environment variables");
  }
  const rawDb = parsed.data.DATABASE_URL?.trim();
  const nodeEnv = parsed.data.NODE_ENV;

  if (nodeEnv === "production") {
    if (!rawDb) {
      throw new Error(
        "DATABASE_URL is required in production. Set it to your Supabase PostgreSQL connection string (e.g. postgresql://…?sslmode=require) on the host.",
      );
    }
    if (rawDb.startsWith("file:")) {
      throw new Error(
        "DATABASE_URL cannot use a file DSN in production. Use Supabase PostgreSQL (postgresql://…).",
      );
    }
    if (!/^postgres(ql)?:\/\//i.test(rawDb)) {
      throw new Error(
        "DATABASE_URL must be a PostgreSQL URL (postgresql:// or postgres://) in production.",
      );
    }
  } else if (!rawDb) {
    throw new Error(
      "DATABASE_URL is not set. Add it to apps/api/.env — see .env.example (PostgreSQL / Supabase).",
    );
  }

  const DATABASE_URL = rawDb!;
  process.env.DATABASE_URL = DATABASE_URL;
  cached = { ...parsed.data, DATABASE_URL };
  return cached;
}
