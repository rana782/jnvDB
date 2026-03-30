from __future__ import annotations

import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()
    rows = cur.execute(
        """
        SELECT s."udise", s."totalStudents", a."total"
        FROM "School" s
        JOIN "SchoolEnrolmentAge" a
          ON a."udise" = s."udise" AND LOWER(a."ageBand") = 'total'
        WHERE s."totalStudents" IS NOT NULL
          AND a."total" IS NOT NULL
          AND a."total" != s."totalStudents"
        """
    ).fetchall()

    fixed = 0
    for udise, school_total, _age_total in rows:
        cur.execute(
            'UPDATE "SchoolEnrolmentAge" SET "total"=? WHERE "udise"=? AND LOWER("ageBand")=\'total\'',
            (school_total, udise),
        )
        fixed += 1

    con.commit()
    con.close()
    print(f"age_total_rows_fixed={fixed}")


if __name__ == "__main__":
    main()
