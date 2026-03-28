This folder holds the **original PostgreSQL-only** Prisma migration history (`migrations/` + `migration_lock.toml`).

The default dev setup now uses **SQLite** (`prisma db push`). To use PostgreSQL again, point `DATABASE_URL` at Postgres, set `provider = "postgresql"` in `schema.prisma`, move `migrations` back under `prisma/migrations`, and run `prisma migrate deploy`.

See [docs/DATABASE_PROVIDERS.md](../../docs/DATABASE_PROVIDERS.md).
