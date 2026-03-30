from __future__ import annotations

import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")
UDISE = "16080801404"


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()
    rows = cur.execute(
        'SELECT "category","total" FROM "SchoolEnrolmentSocial" WHERE "udise"=?',
        (UDISE,),
    ).fetchall()
    totals = {r[0]: (r[1] or 0) for r in rows}
    st = int(totals.get("ST", 0))
    obc = int(totals.get("OBC", 0))
    general = int(totals.get("General", 0))
    total = int(totals.get("Total", 0))
    sc = max(0, total - (st + obc + general))
    cur.execute(
        'UPDATE "SchoolEnrolmentSocial" SET "total"=? WHERE "udise"=? AND "category"=?',
        (sc, UDISE, "SC"),
    )
    con.commit()
    con.close()
    print({"udise": UDISE, "new_sc_total": sc, "check_sum": st + obc + general + sc, "total": total})


if __name__ == "__main__":
    main()
