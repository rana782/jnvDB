# What I can’t do for you vs what is already automated

**I (the assistant) cannot** log into your Render, Vercel, or GitHub account, create services in your name, or see your passwords. Only you can approve those in the browser.

**This repo already includes** `render.yaml` at the **repository root** (`learn_git/render.yaml`). That file tells Render how to create:

- a **free PostgreSQL** database, and  
- a **free Web Service** for the API (`jnv-platform`),

including wiring `DATABASE_URL` and generating `JWT_SECRET`.

Your **local Windows Postgres** (password reset, pgAdmin, etc.) is only for **development**. The **live** site uses the **Postgres on Render** that the blueprint creates.

---

## Step 1 — Push latest code (if needed)

From your machine:

```powershell
cd C:\Users\RANA\Desktop\learn_git
git add -A
git status
git commit -m "Add Render blueprint"   # only if there are changes
git push origin master
```

---

## Step 2 — Render (one Blueprint)

1. Open [render.com](https://render.com) and sign in (e.g. with GitHub).
2. **Dashboard → New → Blueprint**.
3. Connect the **same GitHub repo** as Vercel (`jnvDB` / `learn_git`).
4. Render should detect **`render.yaml`** at the repo root. Apply / create.
5. Wait until **jnv-api** finishes deploying.
6. Open **`https://<your-service>.onrender.com/api/health`** — you should see JSON with `"ok": true`.
7. **Environment → jnv-api → Environment**: add **`CORS_ORIGIN`** = your Vercel URL (step 3), e.g. `https://something.vercel.app` — **no trailing slash**. Save; trigger **Manual Deploy** if needed.

**First-time login user (seed)** — pick one:

**A) GitHub Actions (works on Render free tier, no Shell)** — workflow **Seed production database** (`.github/workflows/seed-production-database.yml`):

1. GitHub → **Settings → Secrets and variables → Actions → New repository secret**  
   - **`PRODUCTION_DATABASE_URL`** = your Render Postgres **External** URL (`postgresql://…`).
2. Optional: **`SEED_FOUNDER_PASSWORD`**, **`SEED_FOUNDER_ROLLCODE`** (if omitted, seed uses `founder` / `change-me-in-prod`).
3. **Actions** → **Seed production database** → **Run workflow** → in **confirm** type **`SEED`** → **Run workflow**.

**B) Render Shell** (paid / some plans): `cd apps/api && npx prisma db seed`

**C) Your PC** with the external `DATABASE_URL` and temporarily `provider = "postgresql"` in `schema.prisma` — [DATABASE_PROVIDERS.md](./DATABASE_PROVIDERS.md).

---

## Step 3 — Vercel (website)

1. [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
2. **Root Directory:** leave **empty** (repository root) **or** set **`jnv-platform`**.  
   - If you leave it empty, the repo root **`vercel.json`** runs install/build inside **`jnv-platform`** (where **`package-lock.json`** lives).  
   - If you set **`jnv-platform`**, do **not** override Install Command with something that runs outside that folder — use default or `npm ci --include=dev`.
3. **Environment variables → Production:**  
   `VITE_API_BASE_URL` = `https://<your-service>.onrender.com` (no trailing slash).
4. Deploy.

Then go back to Render and set **`CORS_ORIGIN`** to the exact Vercel URL.

---

## If the build fails with “Exited with status 127”

Common causes:

1. **`bash` not found** — use the latest `master` (build uses `npm run render-build` / Node, not `bash`).
2. **`prisma: not found`** — Render runs `npm ci` in production mode, which skipped **devDependencies** (where the Prisma CLI lives). Latest `master` uses **`npm ci --include=dev`** in the render build script so `prisma` and `tsc` install during the build.

In **Render → jnv-api → Settings → Build Command** you should have: `npm run render-build`

---

## Checklist

| Check | Where |
|--------|--------|
| `/api/health` works | Browser, Render API URL |
| `CORS_ORIGIN` = Vercel URL | Render → jnv-api → Environment |
| `VITE_API_BASE_URL` = Render API origin | Vercel → Env |
| Seeded founder user | GitHub Action **Seed production database** or Shell / local `prisma db seed` |

---

## More detail

See [DEPLOY_FIRST_TIME.md](./DEPLOY_FIRST_TIME.md).
