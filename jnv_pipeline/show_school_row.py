from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    udise = (sys.argv[1] if len(sys.argv) > 1 else "37080601709").strip()
    con = sqlite3.connect(DB)
    cur = con.cursor()
    row = cur.execute(
        """
        SELECT s."udise", s."schoolName", s."geographicDistrict", s."geographicState", st."name", ro."name"
        FROM "School" s
        LEFT JOIN "State" st ON s."stateId" = st."id"
        LEFT JOIN "RegionOffice" ro ON st."regionId" = ro."id"
        WHERE s."udise" = ?
        """,
        (udise,),
    ).fetchone()
    con.close()
    print(row)


if __name__ == "__main__":
    main()
