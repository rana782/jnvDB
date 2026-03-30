from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    udise = sys.argv[1] if len(sys.argv) > 1 else "22172604333"
    con = sqlite3.connect(DB)
    cur = con.cursor()
    row = cur.execute(
        """
        SELECT "rawText"
        FROM "SchoolExtractionRaw"
        WHERE "udise"=?
        ORDER BY "createdAt" DESC
        LIMIT 1
        """,
        (udise,),
    ).fetchone()
    con.close()
    if not row or not row[0]:
        print("no raw text")
        return
    txt = str(row[0]).replace("\r", "\n")
    lines = [re.sub(r"\s+", " ", l).strip() for l in txt.split("\n")]
    anchors = [
        i
        for i, l in enumerate(lines)
        if re.search(r"enrolment by grade|age in completed years|current academic session", l, re.I)
    ]
    if not anchors:
        print("no age anchor")
        return
    idx = anchors[0]
    start = max(0, idx - 8)
    end = min(len(lines), idx + 120)
    for i in range(start, end):
        if lines[i]:
            print(f"{i:04d}: {lines[i]}")


if __name__ == "__main__":
    main()
