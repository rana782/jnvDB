from __future__ import annotations

import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()
    rows = cur.execute('SELECT "udise" FROM "School"').fetchall()
    updated = 0
    for (udise,) in rows:
        pdf_rel = f"jnv-platform/tools/pmshri-crawler/data/pdfs/{udise}.pdf"
        cur.execute(
            """
            UPDATE "School"
            SET "pdfRelativePath"=?,
                "sourcePdfHash"=COALESCE("sourcePdfHash", ?),
                "updatedAt"=CURRENT_TIMESTAMP
            WHERE "udise"=?
            """,
            (pdf_rel, f"import-{udise}", udise),
        )
        updated += 1
    con.commit()
    con.close()
    print(f"pdf_paths_updated={updated}")


if __name__ == "__main__":
    main()
