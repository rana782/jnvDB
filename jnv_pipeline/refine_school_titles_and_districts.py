from __future__ import annotations

import re
import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")
JNV = "JAWAHAR NAVODAYA VIDYALAYA"

FIXTURE = {
    "09030101501": ("Himachal Pradesh", "Shimla", "JAWAHAR NAVODAYA VIDYALAYA SHIMLA"),
    "21040100801": ("Assam", "Nagaon", "JAWAHAR NAVODAYA VIDYALAYA NAGAON"),
    "11050300101": ("Delhi", "New Delhi", "JAWAHAR NAVODAYA VIDYALAYA NEW DELHI"),
    "11050300102": ("Delhi", "New Delhi", "JAWAHAR NAVODAYA VIDYALAYA NEW DELHI"),
}

BAD_TITLE_HINTS = ("SOCIAL CATEGORY", "OFFICE", "URBAN EDUCATION BLOCK", "EDUCATIONAL BLOCK")


def clean_spaces(v: str | None) -> str:
    return re.sub(r"\s+", " ", (v or "")).strip()


def district_from_title(title: str) -> str | None:
    t = clean_spaces(title).upper()
    if not t.startswith(JNV):
        return None
    tail = t.replace(JNV, "", 1).strip(" ,")
    if not tail:
        return None
    first = tail.split(",")[0].strip()
    if not first or any(h in first for h in BAD_TITLE_HINTS):
        return None
    first = re.sub(r"[^A-Z ]", " ", first).strip()
    return first or None


def main() -> None:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    states = cur.execute('SELECT "id","name","normalizedName" FROM "State"').fetchall()
    sid = {clean_spaces(s["name"]).lower(): s["id"] for s in states}
    sid.update({clean_spaces(s["normalizedName"]).lower(): s["id"] for s in states})

    rows = cur.execute('SELECT "udise","schoolName","geographicDistrict","geographicState" FROM "School"').fetchall()
    patched = 0
    for r in rows:
        udise = r["udise"]
        name = clean_spaces(r["schoolName"]).upper()
        district = clean_spaces(r["geographicDistrict"])
        state = clean_spaces(r["geographicState"])

        if udise in FIXTURE:
            state, district, name = FIXTURE[udise]
        else:
            # Keep only the heading-ish part before known spill markers.
            for marker in [" STATENAVODAYA", " SCHOOL REPORT CARD ", " ACADEMIC YEAR "]:
                i = name.find(marker)
                if i > 0:
                    name = name[:i].strip(" ,")
                    break
            if len(name) > 100:
                name = name[:100].strip(" ,")
            d = district_from_title(name)
            if d:
                district = d.title()

        state_id = sid.get(state.lower())
        cur.execute(
            """
            UPDATE "School"
            SET "schoolName"=?,
                "geographicDistrict"=?,
                "geographicState"=?,
                "apiStateName"=COALESCE("apiStateName", ?),
                "stateId"=COALESCE(?, "stateId"),
                "updatedAt"=CURRENT_TIMESTAMP
            WHERE "udise"=?
            """,
            (name, district or None, state or None, state or None, state_id, udise),
        )
        patched += 1

    con.commit()
    con.close()
    print(f"schools_refined={patched}")


if __name__ == "__main__":
    main()
