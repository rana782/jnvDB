# JNV intelligence platform

Monorepo: **Fastify + Prisma API** (`apps/api`) and **Vite React SPA** (`apps/web`). Scraped assets live under **`tools/pmshri-crawler/data/`** (`pdfs/` is the source of truth for report-card facts; `schools.json` is optional metadata). Legacy layout `pmshri-crawler/data/` at the parent repo root is still discovered when present.

## Prerequisites

- Node 20+
- PostgreSQL 15+

## Quick start (no database password — **SQLite default**)

The API uses **SQLite** at `apps/api/prisma/dev.db` (`DATABASE_URL=file:./dev.db`, path relative to the `prisma/` folder) by default. You do **not** need PostgreSQL or a remembered password.

```bash
cd jnv-platform
npm install
cd apps/api
npm run db:setup
npm run dev
```

Copy `apps/api/.env.example` to `apps/api/.env` if you do not have one, and set `JNV_DATA_ROOT` to the folder that contains **`jnv-platform/`** (e.g. your `learn_git` root). Discovery finds `jnv-platform/tools/pmshri-crawler/data/pdfs` automatically. Example: `JNV_DATA_ROOT=C:/Users/You/Desktop/learn_git`

Then in another terminal:

```bash
cd jnv-platform/apps/web
npm run dev
```

Open http://localhost:5173 — login **founder** / **change-me-in-prod** (unless you changed seed passwords).

Optional: load all PDFs into SQLite (slow):

```bash
cd jnv-platform
npm run import:run
```

## Optional: PostgreSQL (pgAdmin)

If you prefer Postgres, see [docs/DATABASE_PROVIDERS.md](docs/DATABASE_PROVIDERS.md) and [docs/PGADMIN_AND_ENV.md](docs/PGADMIN_AND_ENV.md). You can use `scripts/windows/bootstrap-jnv-platform.ps1` when you know the `postgres` password.

In another shell:

```bash
cd jnv-platform/apps/web
cp .env.example .env.local   # optional
npm run dev
```

- API: `http://localhost:4000` (`/api/health`)
- Web: `http://localhost:5173` (proxies `/api` to the API in dev)

Default seed user: rollcode `founder` / password `change-me-in-prod` (override via `SEED_FOUNDER_*` env vars during `prisma db seed`).

## Import CLI

```bash
cd jnv-platform
npm run import:run
# or force re-extract:
npm run import:run -- --force
```

## Quality gates

```bash
cd jnv-platform
npm run lint
npm test
npm run build
cd apps/web && npx playwright install && npm run e2e
```

## Layout

- `apps/api` — HTTP API, Prisma schema, **single importer** (PDF → DB), revenue engine, canonical school DTOs.
- `apps/web` — Dashboard, map, schools, compare, progress, revenue (all **API-only**, no production mocks).
- `tools/pmshri-crawler` — Playwright crawler and scraped `data/` (PDFs, screenshots, optional `schools.json`). Not a second backend.
- `docs/` — Schema glossary and QA checklist.

## Deploy web on Vercel

Deploy the frontend as a Vite SPA from the **monorepo root** so `npm ci` uses `package-lock.json`.

1. In Vercel, set **Root Directory** to **`jnv-platform`** (not `apps/web`).
2. Use `jnv-platform/vercel.json`: `npm ci`, `npm run build -w @jnv/web`, output **`apps/web/dist`**.
3. Add **`VITE_API_BASE_URL`** = your public API origin (no trailing slash), e.g. `https://api.example.com`.
4. Run the API elsewhere (Node + PostgreSQL). Set **`CORS_ORIGIN`** to your Vercel URL and **`COOKIE_SECURE=true`**.

Step-by-step (GitHub push, API host, env vars): [docs/DEPLOY_FIRST_TIME.md](docs/DEPLOY_FIRST_TIME.md).

SPA rewrites send all routes to `index.html`, so deep links like `/schools/12345678901` work after refresh.
