import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(__dirname, ".env") });

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    /** Avoid shared Prisma/env cache clashes between integration and unit tests. */
    fileParallelism: false,
    server: {
      deps: {
        /** Prevents Vite from re-bundling pdf.js (breaks xref when inlined). */
        external: ["pdf-parse", "pdfjs-dist", "pdfjs-dist/legacy/build/pdf.mjs"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/server.ts", "src/scripts/**"],
    },
  },
});
