/**
 * Render build (Node-only — avoids `bash` missing → exit 127 on some images).
 * Patches Prisma to postgresql for this clone, then generate / build / db push.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "apps", "api", "prisma", "schema.prisma");

let schema = fs.readFileSync(schemaPath, "utf8");
if (schema.includes('provider = "sqlite"')) {
  schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
  fs.writeFileSync(schemaPath, schema);
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
}

// Render sets NODE_ENV=production; plain `npm ci` skips devDependencies, so `prisma` / `tsc` are missing (exit 127).
run("npm ci --include=dev");
run("npm run db:generate -w @jnv/api");
run("npm run build -w @jnv/api");
const apiDir = path.join(root, "apps", "api");
run("npx prisma db push --skip-generate", { cwd: apiDir });
// States, roles, founder login — idempotent. School rows come from Excel import (see jnv_pipeline).
run("npx prisma db seed", { cwd: apiDir });
