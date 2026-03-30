from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    udise = sys.argv[1] if len(sys.argv) > 1 else "16080801404"
    con = sqlite3.connect(DB)
    cur = con.cursor()
    rows = cur.execute(
        'SELECT "category","boys","girls","total" FROM "SchoolEnrolmentSocial" WHERE "udise"=? ORDER BY "category"',
        (udise,),
    ).fetchall()
    con.close()
    print(rows)


if __name__ == "__main__":
    main()
