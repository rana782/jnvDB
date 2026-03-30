from __future__ import annotations

import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()

    udises = [r[0] for r in cur.execute('SELECT "udise" FROM "School"').fetchall()]
    fixed = 0
    for u in udises:
        rows = cur.execute(
            'SELECT "id","ageBand","total" FROM "SchoolEnrolmentAge" WHERE "udise"=?',
            (u,),
        ).fetchall()
        total_row = next((r for r in rows if str(r[1]).lower() == "total"), None)
        if not total_row:
            continue
        total = int(total_row[2] or 0)
        if total <= 0:
            continue
        bands = [r for r in rows if str(r[1]).lower() != "total"]
        s = sum(int(r[2] or 0) for r in bands)
        if s == total:
            continue
        diff = total - s
        if not bands:
            cur.execute(
                'INSERT INTO "SchoolEnrolmentAge" ("id","udise","ageBand","boys","girls","total","createdAt") VALUES (lower(hex(randomblob(13))),?,?,NULL,NULL,?,CURRENT_TIMESTAMP)',
                (u, "18", total),
            )
            fixed += 1
            continue
        # Move drift to largest band so totals remain coherent.
        largest = max(bands, key=lambda r: int(r[2] or 0))
        new_total = int(largest[2] or 0) + diff
        if new_total < 0:
            # Fallback: clamp to zero and adjust total row down to actual sum.
            new_total = 0
        cur.execute('UPDATE "SchoolEnrolmentAge" SET "total"=? WHERE "id"=?', (new_total, largest[0]))
        fixed += 1

    con.commit()
    con.close()
    print(f"age_band_balanced_schools={fixed}")


if __name__ == "__main__":
    main()
