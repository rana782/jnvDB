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
        SELECT "udise","schoolName","geographicDistrict","geographicState"
        FROM "School"
        WHERE LOWER(COALESCE("schoolName","")) NOT LIKE 'jawahar navodaya vidyalaya%'
        ORDER BY "udise" ASC
        """
    ).fetchall()
    out = [
        {
            "udise": r["udise"],
            "schoolName": r["schoolName"],
            "district": r["geographicDistrict"],
            "state": r["geographicState"],
        }
        for r in rows
    ]
    con.close()
    print(json.dumps({"count": len(out), "rows": out[:100]}, indent=2))


if __name__ == "__main__":
    main()
