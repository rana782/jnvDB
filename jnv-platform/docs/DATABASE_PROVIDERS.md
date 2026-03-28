# Database: SQLite (default) vs PostgreSQL

## Default: SQLite (no password)

The API defaults to:

```env
DATABASE_URL=file:./dev.db
```

(Path is relative to the `prisma/` directory, so the file is `apps/api/prisma/dev.db`.)

No PostgreSQL installation or password is required. From `jnv-platform/apps/api`:

```bash
npm run db:setup
```

This runs `prisma generate`, `prisma db push`, and `prisma db seed`.

The SQLite file is gitignored (`*.db` under `prisma/`).

## Optional: PostgreSQL (production / team)

1. Install PostgreSQL and create a database (e.g. `jnv_intel`).
2. Set in `apps/api/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/jnv_intel?schema=public
```

3. In `prisma/schema.prisma`, change:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

4. Restore SQL migrations: copy `prisma/_postgresql_migrations_backup/migrations` back to `prisma/migrations` (or create fresh migrations with `prisma migrate dev`).

5. Run `npx prisma migrate deploy` instead of `db push` for production workflows.

PostgreSQL-specific column types (`@db.VarChar`, `@db.Text`) were removed from the schema so one model works with both providers; you may reintroduce them if you maintain a Postgres-only branch.
