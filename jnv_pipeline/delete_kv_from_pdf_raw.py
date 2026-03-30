from __future__ import annotations

import json
import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    rows = cur.execute(
        """
        SELECT DISTINCT s."udise"
        FROM "SchoolExtractionRaw" r
        JOIN "School" s ON s."udise" = r."udise"
        WHERE
          LOWER(COALESCE(r."rawText","")) LIKE '%kendriya%vidyalaya%'
          OR LOWER(COALESCE(r."rawText","")) LIKE '%kendriya%vidyalaya%sangathan%'
          OR LOWER(COALESCE(r."rawText","")) LIKE '%vidyalaya%sangathan%'
        ORDER BY s."udise" ASC
        """
    ).fetchall()
    udises = [r["udise"] for r in rows]

    deleted = 0
    with con:
        for u in udises:
            cur.execute('DELETE FROM "School" WHERE "udise"=?', (u,))
            deleted += cur.rowcount

    con.close()
    print(json.dumps({"matched_udises": udises, "deleted_schools": deleted}, indent=2))


if __name__ == "__main__":
    main()
