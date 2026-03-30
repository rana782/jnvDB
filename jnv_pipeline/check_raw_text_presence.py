from __future__ import annotations

import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()
    total = cur.execute('SELECT COUNT(*) FROM "School"').fetchone()[0]
    with_raw = cur.execute(
        """
        SELECT COUNT(DISTINCT s."udise")
        FROM "School" s
        JOIN "SchoolExtractionRaw" r ON r."udise" = s."udise"
        WHERE r."rawText" IS NOT NULL AND LENGTH(TRIM(r."rawText")) > 50
        """
    ).fetchone()[0]
    print({"schools": total, "with_raw_text": with_raw})
    con.close()


if __name__ == "__main__":
    main()
