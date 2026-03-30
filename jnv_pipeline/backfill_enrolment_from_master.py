from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path

import pandas as pd


ROOT = Path(r"C:\Users\RANA\Desktop\learn_git")
MASTER = ROOT / "jnv_pipeline" / "output" / "JNV_bulk_import_ready_MASTER.xlsx"
DB = ROOT / "jnv-platform" / "apps" / "api" / "prisma" / "dev.db"


def s(v: object) -> str:
    if v is None or pd.isna(v):
        return ""
    return str(v).strip()


def ud(v: object) -> str:
    x = s(v).replace(".0", "")
    if x.isdigit():
        return x.zfill(11)
    return ""


def i(v: object) -> int | None:
    x = s(v).replace(",", "")
    if not x:
        return None
    try:
        return int(float(x))
    except Exception:
        return None


def rows_by_udise(df: pd.DataFrame) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for _, r in df.iterrows():
        u = ud(r.get("udise"))
        if not u:
            continue
        out.setdefault(u, []).append(r.to_dict())
    return out


def main() -> None:
    schools = pd.read_excel(MASTER, sheet_name="schools", dtype=object)
    social = pd.read_excel(MASTER, sheet_name="enrolment_social", dtype=object)
    minority = pd.read_excel(MASTER, sheet_name="enrolment_minority", dtype=object)
    others = pd.read_excel(MASTER, sheet_name="enrolment_others", dtype=object)
    age = pd.read_excel(MASTER, sheet_name="enrolment_age", dtype=object)

    social_map = rows_by_udise(social)
    minority_map = rows_by_udise(minority)
    others_map = rows_by_udise(others)
    age_map = rows_by_udise(age)

    con = sqlite3.connect(DB)
    cur = con.cursor()

    patched = 0
    with con:
        for _, r in schools.iterrows():
            u = ud(r.get("udise"))
            if not u:
                continue
            ts = i(r.get("total_students"))
            tb = i(r.get("total_boys"))
            tg = i(r.get("total_girls"))
            cur.execute(
                """
                UPDATE "School"
                SET "totalStudents" = COALESCE(?, "totalStudents"),
                    "totalBoys" = COALESCE(?, "totalBoys"),
                    "totalGirls" = COALESCE(?, "totalGirls"),
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "udise" = ?
                """,
                (ts, tb, tg, u),
            )

            # Social / minority / others: refresh fully from validated workbook.
            for tbl in ["SchoolEnrolmentSocial", "SchoolEnrolmentMinority", "SchoolEnrolmentOthers"]:
                cur.execute(f'DELETE FROM "{tbl}" WHERE "udise"=?', (u,))

            for row in social_map.get(u, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentSocial" ("id","udise","category","boys","girls","total","createdAt")
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], u, s(row.get("category")), i(row.get("boys")), i(row.get("girls")), i(row.get("total"))),
                )
            for row in minority_map.get(u, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentMinority" ("id","udise","category","boys","girls","total","createdAt")
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], u, s(row.get("category")), i(row.get("boys")), i(row.get("girls")), i(row.get("total"))),
                )
            for row in others_map.get(u, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentOthers" ("id","udise","category","boys","girls","total","createdAt")
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], u, s(row.get("category")), i(row.get("boys")), i(row.get("girls")), i(row.get("total"))),
                )

            # Age: preserve existing granular bands, only ensure Total row exists/updated.
            total_row = (age_map.get(u) or [{}])[0]
            total_boys = i(total_row.get("boys"))
            total_girls = i(total_row.get("girls"))
            total_total = i(total_row.get("total"))
            existing_total = cur.execute(
                'SELECT "id" FROM "SchoolEnrolmentAge" WHERE "udise"=? AND LOWER("ageBand")=\'total\'',
                (u,),
            ).fetchone()
            if existing_total:
                cur.execute(
                    """
                    UPDATE "SchoolEnrolmentAge"
                    SET "boys" = COALESCE(?, "boys"),
                        "girls" = COALESCE(?, "girls"),
                        "total" = COALESCE(?, "total")
                    WHERE "udise"=? AND LOWER("ageBand")='total'
                    """,
                    (total_boys, total_girls, total_total, u),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentAge" ("id","udise","ageBand","boys","girls","total","createdAt")
                    VALUES (?, ?, 'Total', ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], u, total_boys, total_girls, total_total),
                )

            patched += 1

    con.close()
    print(f"schools_enrolment_backfilled={patched}")


if __name__ == "__main__":
    main()
