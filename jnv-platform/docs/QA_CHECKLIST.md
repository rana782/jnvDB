# QA checklist — JNV intelligence platform

## Auth & session

- [ ] Login with seeded founder rollcode sets `jnv_token` httpOnly cookie.
- [ ] `/api/auth/me` returns roles after login; 401 after logout.
- [ ] Browser calls include `credentials: "include"` from the SPA.

## Data paths

- [ ] With repo root as `JNV_DATA_ROOT`, `/api/health/data-paths` resolves `schools.json` and `pdfs/`.
- [ ] PDF streaming returns `application/pdf` when file exists on disk.

## Import

- [ ] `POST /api/import/run` returns `202` with `jobId`; job eventually reaches `COMPLETED`, `PARTIAL`, or `FAILED`.
- [ ] Re-run with same PDF hash skips extract unless `force: true`.
- [ ] `seedOnly` path upserts schools without touching PDFs.

## API contracts

- [ ] `/api/dashboard/summary` shape stable for dashboard cards.
- [ ] `/api/dashboard/map` returns `states[]`, `regions[]`, `totalSchools`.
- [ ] `/api/schools` pagination query params (`page`, `pageSize`, `q`, filters) behave consistently.

## Frontend

- [ ] URL query params on `/schools` round-trip filters.
- [ ] Map page renders schematic GeoJSON and lists states.
- [ ] Compare page reads multiple `?u=` UDISE values.
- [ ] Revenue lab mutation hits `/api/revenue/calculate` when API online.

## E2E

- [ ] Playwright smoke: login page visible; unauthenticated `/dashboard` redirects to `/login`.

## Edge cases

- [ ] Missing `DATABASE_URL` returns 503 from Prisma-backed routes (not from `/api/health`).
- [ ] Invalid UDISE in PDF filename logged as import warning, job continues.
