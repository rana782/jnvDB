from __future__ import annotations

import re
import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")

BAD_DISTRICT_TOKENS = {
    "office",
    "social category",
    "educational block",
    "urban education block",
    "rural / urban",
    "cluster",
    "pincode",
}

STATE_ALIASES = {
    "jammu & kashmir": "jammu and kashmir",
    "andaman & nicobar": "andaman and nicobar islands",
    "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
    "daman and diu": "dadra and nagar haveli and daman and diu",
}

JNV = "JAWAHAR NAVODAYA VIDYALAYA"


def norm_spaces(v: str | None) -> str:
    return re.sub(r"\s+", " ", (v or "")).strip()


def state_key(v: str | None) -> str:
    s = norm_spaces(v).lower().replace(".", " ")
    s = re.sub(r"\s+", " ", s)
    return STATE_ALIASES.get(s, s)


def title_case(v: str) -> str:
    return " ".join(part[:1].upper() + part[1:].lower() for part in norm_spaces(v).split(" "))


def clean_school_name(raw: str, district: str | None) -> str:
    s = norm_spaces(raw)
    if not s:
        return ""
    # Trim common OCR spill markers.
    cut_markers = [
        " School Report Card ",
        " Academic Year ",
        " StateNAVODAYA",
        " State NAVODAYA",
        " Educational District",
        " Rural / Urban",
    ]
    for marker in cut_markers:
        idx = s.find(marker)
        if idx > 0:
            s = s[:idx].strip(" ,")
            break
    # Extract first probable JNV heading.
    m = re.search(r"(JAWAHAR\s+NAVODAYA\s+VIDYALAYA[^,]*(?:,\s*[^,]+)?)", s, re.I)
    if m:
        s = norm_spaces(m.group(1)).upper()
    if s.upper() == JNV and district:
        d = norm_spaces(district).upper()
        if d:
            s = f"{JNV} {d}"
    return s.upper()


def clean_district(raw_district: str | None, school_name: str, udise: str) -> str:
    d = norm_spaces(raw_district)
    d_lower = d.lower()
    if d and d_lower not in BAD_DISTRICT_TOKENS and "block" not in d_lower and "category" not in d_lower:
        if d.isdigit() and len(d) == 11:
            d = ""
        else:
            return title_case(d)

    suffix = school_name.upper().replace(JNV, "", 1).strip(" ,")
    if suffix:
        first = suffix.split(",")[0].strip(" ,")
        first = re.sub(r"[^A-Z ]", " ", first).strip()
        if first and first.lower() not in BAD_DISTRICT_TOKENS:
            return title_case(first)
    return udise


def main() -> None:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    states = cur.execute('SELECT "id","name","normalizedName" FROM "State"').fetchall()
    state_id_by_key: dict[str, str] = {}
    for st in states:
        state_id_by_key[state_key(st["name"])] = st["id"]
        state_id_by_key[state_key(st["normalizedName"])] = st["id"]

    rows = cur.execute('SELECT "udise","schoolName","geographicDistrict","geographicState","apiStateName" FROM "School"').fetchall()
    fixed = 0
    missing_state_link = 0

    for r in rows:
        udise = r["udise"]
        raw_name = r["schoolName"] or ""
        geo_state = norm_spaces(r["geographicState"] or r["apiStateName"] or "")
        cleaned_name = clean_school_name(raw_name, r["geographicDistrict"])
        if not cleaned_name:
            cleaned_name = f"{JNV} {udise}"
        cleaned_district = clean_district(r["geographicDistrict"], cleaned_name, udise)

        sid = state_id_by_key.get(state_key(geo_state)) if geo_state else None
        if sid is None:
            missing_state_link += 1

        cur.execute(
            """
            UPDATE "School"
            SET "schoolName"=?,
                "geographicDistrict"=?,
                "geographicState"=?,
                "apiStateName"=?,
                "stateId"=?,
                "updatedAt"=CURRENT_TIMESTAMP
            WHERE "udise"=?
            """,
            (
                cleaned_name,
                cleaned_district,
                geo_state or None,
                geo_state or None,
                sid,
                udise,
            ),
        )
        fixed += 1

    con.commit()
    con.close()
    print(f"schools_repaired={fixed}")
    print(f"schools_missing_state_link_after_repair={missing_state_link}")


if __name__ == "__main__":
    main()
