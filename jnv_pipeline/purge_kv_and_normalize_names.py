from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")

KV_PATTERNS = [
    r"kendriya\s+vidyalaya",
    r"vidyalaya\s+sangathan",
    r"\bkvs\b",
]


def normalize_jnv_name(raw: str) -> str:
    s = re.sub(r"\s+", " ", (raw or "")).strip()
    # Keep from first "Jawahar Navodaya Vidyalaya" occurrence.
    m = re.search(r"(jawahar\s+navodaya\s+vidyalaya.*)$", s, re.I)
    if m:
        s = m.group(1).strip()
    return s.upper()


def main() -> None:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # 1) True KV/KVS rows (case-insensitive across schoolName + managementName).
    kv_rows = cur.execute(
        """
        SELECT "udise","schoolName","managementName","geographicDistrict","geographicState"
        FROM "School"
        WHERE
          LOWER(COALESCE("schoolName","")) LIKE '%kendriya%vidyalaya%'
          OR LOWER(COALESCE("schoolName","")) LIKE '%vidyalaya%sangathan%'
          OR LOWER(COALESCE("schoolName","")) LIKE '%kvs%'
          OR LOWER(COALESCE("managementName","")) LIKE '%kendriya%vidyalaya%'
          OR LOWER(COALESCE("managementName","")) LIKE '%vidyalaya%sangathan%'
          OR LOWER(COALESCE("managementName","")) LIKE '%kvs%'
        ORDER BY "udise" ASC
        """
    ).fetchall()

    kv_udises = [r["udise"] for r in kv_rows]
    deleted = 0
    with con:
        for u in kv_udises:
            # Child rows are cascade-linked from School.
            cur.execute('DELETE FROM "School" WHERE "udise"=?', (u,))
            deleted += 1

    # 2) Normalize odd but valid JNV names with prefixes (CENTRAL GOVT ...).
    weird_rows = cur.execute(
        """
        SELECT "udise","schoolName"
        FROM "School"
        WHERE LOWER(COALESCE("schoolName","")) NOT LIKE 'jawahar navodaya vidyalaya%'
        ORDER BY "udise" ASC
        """
    ).fetchall()
    normalized = 0
    with con:
        for r in weird_rows:
            old = r["schoolName"] or ""
            new = normalize_jnv_name(old)
            if new and new != old:
                cur.execute('UPDATE "School" SET "schoolName"=?, "updatedAt"=CURRENT_TIMESTAMP WHERE "udise"=?', (new, r["udise"]))
                normalized += 1

    out = {
        "kv_matches_found": len(kv_udises),
        "kv_deleted": deleted,
        "normalized_nonstandard_jnv_names": normalized,
        "deleted_udises": kv_udises,
    }
    con.close()
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
