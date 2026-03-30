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
        SELECT DISTINCT s."udise", s."schoolName", s."geographicDistrict", s."geographicState",
               st."name" as stateName, ro."name" as regionName
        FROM "SchoolExtractionRaw" r
        JOIN "School" s ON s."udise" = r."udise"
        LEFT JOIN "State" st ON s."stateId" = st."id"
        LEFT JOIN "RegionOffice" ro ON st."regionId" = ro."id"
        WHERE
          LOWER(COALESCE(r."rawText", "")) LIKE '%kendriya%vidyalaya%'
          OR LOWER(COALESCE(r."rawText", "")) LIKE '%vidyalaya%sangathan%'
          OR LOWER(COALESCE(r."rawText", "")) LIKE '%kvs%'
        ORDER BY s."udise" ASC
        """
    ).fetchall()

    out = [
        {
            "udise": r["udise"],
            "schoolName": r["schoolName"],
            "district": r["geographicDistrict"],
            "state": r["geographicState"] or r["stateName"],
            "region": r["regionName"],
        }
        for r in rows
    ]
    con.close()
    print(json.dumps({"count": len(out), "rows": out[:50]}, indent=2))


if __name__ == "__main__":
    main()
