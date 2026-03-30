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

**First-time login user (seed):** After a successful deploy, the API’s `schema.prisma` on Render is already **postgresql** (the build script switches it). In **jnv-api → Shell** (if your plan includes it), run:

```bash
cd apps/api && npx prisma db seed
```

If you do not have Shell, use Render’s Postgres **SQL** console or a local tool with the **external** `DATABASE_URL` only after temporarily switching `provider` to `postgresql` in `schema.prisma` on your PC (see [DATABASE_PROVIDERS.md](./DATABASE_PROVIDERS.md)) — Shell is much simpler when available.

---

## Step 3 — Vercel (website)

1. [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
2. **Root Directory:** `jnv-platform`.
3. **Environment variables → Production:**  
   `VITE_API_BASE_URL` = `https://<your-service>.onrender.com` (no trailing slash).
4. Deploy.

Then go back to Render and set **`CORS_ORIGIN`** to the exact Vercel URL.

---

## Checklist

| Check | Where |
|--------|--------|
| `/api/health` works | Browser, Render API URL |
| `CORS_ORIGIN` = Vercel URL | Render → jnv-api → Environment |
| `VITE_API_BASE_URL` = Render API origin | Vercel → Env |
| Seeded founder user | `prisma db seed` on prod DB |

---

## More detail

See [DEPLOY_FIRST_TIME.md](./DEPLOY_FIRST_TIME.md).
