# PostgreSQL + pgAdmin setup (JNV platform)

Your pgAdmin server **jnvDB** is a *connection* to PostgreSQL. Typical values (from your screenshots):

| Setting | Value |
|--------|--------|
| Host | `127.0.0.1` |
| Port | `5432` |
| User | `postgres` |
| Password | The password you type when connecting (enable **Save password** in pgAdmin if you want it remembered) |

## 1. Create the application database

Prisma expects a dedicated database (default name: **`jnv_intel`**), not only the `postgres` maintenance database.

**Option A — pgAdmin**

1. Connect to server **jnvDB** (enter your real password on the Connection tab).
2. Right-click **Databases** → **Create** → **Database**.
3. Name: `jnv_intel` → Save.

**Option B — Query Tool**

Open **Query Tool** on database `postgres` and run:

```sql
CREATE DATABASE jnv_intel;
```

(If it already exists, you can ignore the error or use `IF NOT EXISTS` on PostgreSQL 15+.)

## 2. Create `.env` for the API

**Easiest:** run the bootstrap script (see `README.md`) and pass the **same password** you use in pgAdmin:

```powershell
cd jnv-platform\scripts\windows
.\bootstrap-jnv-platform.ps1 -PostgresPassword "YOUR_PGADMIN_PASSWORD"
```

**Manual:** copy `apps/api/.env.example` to `apps/api/.env` and set:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/jnv_intel?schema=public
JNV_DATA_ROOT=C:/Users/RANA/Desktop/learn_git
```

Use forward slashes in `JNV_DATA_ROOT`. It must be the folder that **contains** `jnv-platform/tools/pmshri-crawler/data/pdfs` (or legacy `pmshri-crawler/data/pdfs`). `schools.json` is optional.

If your password contains `@`, `#`, `:`, or `%`, use the bootstrap script (it URL-encodes the password) or encode it yourself in the URL.

## 3. Apply schema and seed

From `jnv-platform/apps/api`:

```powershell
npx prisma migrate deploy
npx prisma db seed
```

## 4. Run the stack

Terminal 1 — API:

```powershell
cd jnv-platform\apps\api
npm run dev
```

Terminal 2 — Web:

```powershell
cd jnv-platform\apps\web
npm run dev
```

- API health: http://localhost:4000/api/health  
- App: http://localhost:5173  
- Login (after seed): rollcode `founder`, password from `SEED_FOUNDER_PASSWORD` in `.env` (default in `.env.example`).

## Troubleshooting

| Error | What to do |
|-------|------------|
| `P1000` Authentication failed | Wrong password in `DATABASE_URL` — must match pgAdmin for user `postgres`. |
| Database `jnv_intel` does not exist | Create it (step 1). |
| Could not locate scraped PDF data | Set `JNV_DATA_ROOT` to repo root (`learn_git`), or ensure `jnv-platform/tools/pmshri-crawler/data/pdfs` exists. |
