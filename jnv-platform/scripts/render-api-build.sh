#!/usr/bin/env bash
# Render-only build: patch Prisma to postgresql for this machine (fresh clone each deploy).
# Do not run locally unless you revert after: git checkout -- apps/api/prisma/schema.prisma
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SCHEMA="$ROOT/apps/api/prisma/schema.prisma"

if grep -q 'provider = "sqlite"' "$SCHEMA"; then
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' "$SCHEMA"
fi

npm ci
npm run db:generate -w @jnv/api
npm run build -w @jnv/api
(cd apps/api && npx prisma db push --skip-generate)
