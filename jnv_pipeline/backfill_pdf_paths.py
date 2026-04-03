"""
Set School.pdfRelativePath from a path template (no PDF parsing).

Use after Excel import when PDFs live on disk under JNV_DATA_ROOT. Paths are stored
relative to the monorepo (same as the API's resolveExistingPdfAbsolute).

Requires DATABASE_URL:
  - postgresql://...  → psycopg2
  - file:./dev.db     → SQLite under jnv-platform/apps/api/prisma/

Optional env:
  JNV_PDF_REL_TEMPLATE — default: jnv-platform/tools/pmshri-crawler/data/pdfs/{udise}.pdf

Run from repo root (learn_git):
  set DATABASE_URL=postgresql://...
  py jnv_pipeline/backfill_pdf_paths.py
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    psycopg2 = None  # type: ignore[misc, assignment]

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TEMPLATE = "jnv-platform/tools/pmshri-crawler/data/pdfs/{udise}.pdf"
PRISMA_DIR = REPO_ROOT / "jnv-platform" / "apps" / "api" / "prisma"


def resolve_sqlite_db_path(dsn: str) -> Path:
    if not dsn.startswith("file:"):
        raise ValueError("Expected DATABASE_URL to start with file: for SQLite")
    rest = dsn[5:].strip()
    if rest.startswith("./"):
        return (PRISMA_DIR / rest[2:]).resolve()
    p = Path(rest)
    return p.resolve() if p.is_absolute() else (PRISMA_DIR / rest).resolve()


def main() -> None:
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        print("Set DATABASE_URL (PostgreSQL or file:.../dev.db).", file=sys.stderr)
        raise SystemExit(2)

    template = os.environ.get("JNV_PDF_REL_TEMPLATE", DEFAULT_TEMPLATE)
    if "{udise}" not in template:
        print("JNV_PDF_REL_TEMPLATE must contain {udise}", file=sys.stderr)
        raise SystemExit(2)

    updated = 0

    if "postgres" in dsn.split(":", 1)[0].lower():
        if psycopg2 is None:
            print("pip install psycopg2-binary", file=sys.stderr)
            raise SystemExit(1)
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        cur.execute('SELECT "udise" FROM "School"')
        rows = cur.fetchall()
        for (udise,) in rows:
            pdf_rel = template.format(udise=udise)
            cur.execute(
                """
                UPDATE "School"
                SET "pdfRelativePath"=%s,
                    "sourcePdfHash"=COALESCE("sourcePdfHash", %s),
                    "updatedAt"=CURRENT_TIMESTAMP
                WHERE "udise"=%s
                """,
                (pdf_rel, f"path-backfill:{udise}", udise),
            )
            updated += 1
        conn.commit()
        cur.close()
        conn.close()
    else:
        db_path = resolve_sqlite_db_path(dsn)
        if not db_path.exists():
            raise FileNotFoundError(f"SQLite DB not found: {db_path}")
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        cur.execute('SELECT "udise" FROM "School"')
        for (udise,) in cur.fetchall():
            pdf_rel = template.format(udise=udise)
            cur.execute(
                """
                UPDATE "School"
                SET "pdfRelativePath"=?,
                    "sourcePdfHash"=COALESCE("sourcePdfHash", ?),
                    "updatedAt"=CURRENT_TIMESTAMP
                WHERE "udise"=?
                """,
                (pdf_rel, f"path-backfill:{udise}", udise),
            )
            updated += 1
        con.commit()
        con.close()

    print(f"pdf_paths_updated={updated} template={template!r}")


if __name__ == "__main__":
    main()
