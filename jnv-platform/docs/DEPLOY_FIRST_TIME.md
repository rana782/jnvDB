# First-time deploy: GitHub + Vercel + API

Your app has two parts:

1. **Website (React)** — host on **Vercel** (static files + SPA routing).
2. **API (Fastify + database)** — host on a **Node** host with a **PostgreSQL** database (Vercel does not run this API as a long-lived server in this repo).

Until the API is live and the site knows its URL, the deployed site will not load data or log in.

---

## Part A — Push code to GitHub

1. Install [Git](https://git-scm.com/) if needed and sign in to [GitHub](https://github.com/).
2. On GitHub, create a **new repository** (empty, no README required). Copy the repo URL (HTTPS), e.g. `https://github.com/YOU/jnvDB.git`.
3. On your PC, open PowerShell in your project folder (the folder that contains `jnv-platform`).
4. If this folder is not a git repo yet:
   - `git init`
   - `git branch -M master`
   - `git remote add origin https://github.com/YOU/YOUR-REPO.git`
5. If you already have `origin`, skip adding it again.
6. Stage, commit, push:
   - `git add -A`
   - `git status` — confirm **no** `.env` files, **no** `dev.db`, **no** `.venv` are listed.
   - `git commit -m "Prepare monorepo for Vercel and production API"`
   - `git push -u origin master`

If `git push` asks for a password, use a **GitHub Personal Access Token** (not your account password): GitHub → Settings → Developer settings → Personal access tokens.

---

## Part B — Deploy the API (PostgreSQL + Node)

Pick one provider you are comfortable with (Railway, Render, Fly.io, etc.). Concept is the same everywhere.

### 1. Create PostgreSQL

- Add a **PostgreSQL** database in that provider.
- Copy the **connection string** (often called `DATABASE_URL`). It should look like `postgresql://user:pass@host:5432/dbname`.

### 2. Create a **Web Service** for the API

- **Root directory / working directory:** `jnv-platform` (or the monorepo root that contains `apps/api`).
- **Build command** (example):

  `npm ci && npm run db:generate -w @jnv/api && npm run build -w @jnv/api && cd apps/api && npx prisma migrate deploy`

  If you have not committed Prisma migrations for Postgres yet, use **`prisma db push`** once instead of `migrate deploy` (see [DATABASE_PROVIDERS.md](./DATABASE_PROVIDERS.md)).

- **Start command:**

  `npm run start -w @jnv/api`

- **Port:** the platform usually sets `PORT`; the API reads `PORT` from the environment (default 4000).

### 3. Environment variables on the API host

Set these (names match `apps/api/.env.example`):

| Variable | Example / note |
|----------|----------------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your Postgres URL from the provider |
| `JWT_SECRET` | Long random string (32+ characters) |
| `CORS_ORIGIN` | Your Vercel site URL, e.g. `https://your-app.vercel.app` (comma-separated if you add a custom domain later) |
| `COOKIE_SECURE` | `true` (required for HTTPS) |
| `JNV_DATA_ROOT` | Optional: path on the server to data; for PDF-heavy imports you may need persistent storage or upload strategy |

After deploy, open **`https://YOUR-API-HOST/api/health`** in a browser. You should get a healthy JSON response.

### 4. Seed or migrate data

Run your normal Prisma seed / import against **production** only when you understand it will write to the live database (e.g. `prisma db seed` or your import CLI on the server or from your machine pointed at prod — advanced).

---

## Part C — Deploy the website on Vercel

1. Sign up at [vercel.com](https://vercel.com) with GitHub.
2. **Add New Project** → **Import** your GitHub repository.
3. **Root Directory:** set to **`jnv-platform`** (the folder that contains this `vercel.json` and `package-lock.json`).
4. Vercel should detect settings from `jnv-platform/vercel.json` (`npm ci`, build workspace `@jnv/web`, output `apps/web/dist`).
5. **Environment variables** (Production):
   - `VITE_API_BASE_URL` = your **public API origin only**, no trailing slash, e.g. `https://your-api.up.railway.app`
6. Click **Deploy**.

When the build finishes, open the Vercel URL. Login and API calls use `VITE_API_BASE_URL` with cookies; your API **must** list your exact Vercel origin in `CORS_ORIGIN` and use `COOKIE_SECURE=true`.

---

## Quick checks if something fails

| Symptom | What to verify |
|--------|----------------|
| Blank data / network errors | `VITE_API_BASE_URL` matches the API URL; API is running; `/api/health` works |
| CORS errors in browser console | `CORS_ORIGIN` includes your Vercel URL exactly (`https://...`) |
| Login fails with HTTPS | `COOKIE_SECURE=true` on the API |
| Database errors | `DATABASE_URL` correct; `prisma migrate deploy` or `db push` ran on prod |

---

## Summary

1. Push repo to GitHub.  
2. Deploy API + Postgres; note public API URL; set `CORS_ORIGIN` + `COOKIE_SECURE` + `JWT_SECRET`.  
3. Deploy **Root Directory `jnv-platform`** on Vercel with `VITE_API_BASE_URL` pointing at that API.
