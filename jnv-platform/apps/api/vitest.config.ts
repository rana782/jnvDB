import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
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
