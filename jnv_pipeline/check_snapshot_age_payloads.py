from __future__ import annotations

import json
import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()
    rows = cur.execute('SELECT "udise","payload" FROM "SchoolReportCardSnapshot"').fetchall()
    with_age = 0
    with_bands = 0
    examples: list[str] = []
    for udise, payload in rows:
        try:
            obj = json.loads(payload) if isinstance(payload, str) else payload
        except Exception:
            continue
        st = (obj or {}).get("structured") or {}
        age = st.get("enrolmentAge") or {}
        if isinstance(age, dict) and age:
            with_age += 1
            keys = [k for k, v in age.items() if k != "Total" and isinstance(v, (int, float)) and v > 0]
            if keys:
                with_bands += 1
                if len(examples) < 12:
                    examples.append(udise)
    con.close()
    print({"snapshots": len(rows), "with_age_object": with_age, "with_positive_bands": with_bands, "examples": examples})


if __name__ == "__main__":
    main()
