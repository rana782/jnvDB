from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path

import pandas as pd


ROOT = Path(r"C:\Users\RANA\Desktop\learn_git")
MASTER_XLSX = ROOT / "jnv_pipeline" / "output" / "JNV_bulk_import_ready_MASTER.xlsx"
DEV_DB = ROOT / "jnv-platform" / "apps" / "api" / "prisma" / "dev.db"


ALIASES = {
    "jammu & kashmir": "jammu and kashmir",
    "andaman & nicobar": "andaman and nicobar islands",
    "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
    "daman and diu": "dadra and nagar haveli and daman and diu",
    "daman": "dadra and nagar haveli and daman and diu",
    "diu": "dadra and nagar haveli and daman and diu",
}


def nstr(v: object) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)) or pd.isna(v):
        return ""
    return str(v).strip()


def nudise(v: object) -> str:
    s = nstr(v).replace(".0", "")
    if s.isdigit():
        return s.zfill(11)
    return ""


def nint(v: object) -> int | None:
    s = nstr(v).replace(",", "")
    if s == "":
        return None
    try:
        return int(float(s))
    except Exception:
        return None


def nfloat(v: object) -> float | None:
    s = nstr(v)
    if s == "":
        return None
    try:
        return float(s)
    except Exception:
        return None


def nbool(v: object) -> int | None:
    s = nstr(v).lower()
    if s in {"true", "1", "yes"}:
        return 1
    if s in {"false", "0", "no"}:
        return 0
    return None


def normalize_state(v: object) -> str:
    s = " ".join(nstr(v).lower().replace(".", " ").split())
    if s in ALIASES:
        s = ALIASES[s]
    return s


def resolve_state_id(state: str, state_map: dict[str, str]) -> str | None:
    if not state:
        return None
    n = normalize_state(state)
    if n in state_map:
        return state_map[n]
    # loose fallback
    for k, sid in state_map.items():
        if len(k) >= 4 and (n in k or k in n):
            return sid
    return None


def group_by_udise(df: pd.DataFrame) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for _, r in df.iterrows():
        u = nudise(r.get("udise"))
        if not u:
            continue
        out.setdefault(u, []).append(r.to_dict())
    return out


def main() -> None:
    if not MASTER_XLSX.exists():
        raise FileNotFoundError(f"Master workbook not found: {MASTER_XLSX}")
    if not DEV_DB.exists():
        raise FileNotFoundError(f"DB not found: {DEV_DB}")

    schools = pd.read_excel(MASTER_XLSX, sheet_name="schools", dtype=object)
    social = pd.read_excel(MASTER_XLSX, sheet_name="enrolment_social", dtype=object)
    minority = pd.read_excel(MASTER_XLSX, sheet_name="enrolment_minority", dtype=object)
    others = pd.read_excel(MASTER_XLSX, sheet_name="enrolment_others", dtype=object)
    age = pd.read_excel(MASTER_XLSX, sheet_name="enrolment_age", dtype=object)
    facilities = pd.read_excel(MASTER_XLSX, sheet_name="facilities", dtype=object)

    social_map = group_by_udise(social)
    minority_map = group_by_udise(minority)
    others_map = group_by_udise(others)
    age_map = group_by_udise(age)
    fac_map = {nudise(r.get("udise")): r.to_dict() for _, r in facilities.iterrows() if nudise(r.get("udise"))}

    con = sqlite3.connect(DEV_DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    states = cur.execute('SELECT "id","name","normalizedName" FROM "State"').fetchall()
    state_map: dict[str, str] = {}
    for s in states:
        sid = s["id"]
        state_map[normalize_state(s["name"])] = sid
        state_map[normalize_state(s["normalizedName"])] = sid

    imported = 0
    with con:
        for _, row in schools.iterrows():
            udise = nudise(row.get("udise"))
            if not udise:
                continue

            school_name = nstr(row.get("school_name")) or f"JAWAHAR NAVODAYA VIDYALAYA {udise}"
            state = nstr(row.get("state"))
            district = nstr(row.get("district"))
            academic_year = nstr(row.get("academic_year"))
            total_students = nint(row.get("total_students"))
            total_boys = nint(row.get("total_boys"))
            total_girls = nint(row.get("total_girls"))
            conf = nfloat(row.get("parse_confidence"))
            state_id = resolve_state_id(state, state_map)

            cur.execute(
                """
                INSERT INTO "School" (
                  "udise","schoolName","geographicState","geographicDistrict",
                  "stateId","academicYear","totalStudents","totalBoys","totalGirls",
                  "parsingStatus","extractorVersion","overallExtractionConfidence","updatedAt"
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETE', 'jnv_pipeline.1.0', ?, CURRENT_TIMESTAMP)
                ON CONFLICT("udise") DO UPDATE SET
                  "schoolName"=excluded."schoolName",
                  "geographicState"=excluded."geographicState",
                  "geographicDistrict"=excluded."geographicDistrict",
                  "stateId"=COALESCE(excluded."stateId","School"."stateId"),
                  "academicYear"=excluded."academicYear",
                  "totalStudents"=excluded."totalStudents",
                  "totalBoys"=excluded."totalBoys",
                  "totalGirls"=excluded."totalGirls",
                  "parsingStatus"='COMPLETE',
                  "overallExtractionConfidence"=excluded."overallExtractionConfidence",
                  "updatedAt"=CURRENT_TIMESTAMP
                """,
                (
                    udise,
                    school_name,
                    state or None,
                    district or None,
                    state_id,
                    academic_year or None,
                    total_students,
                    total_boys,
                    total_girls,
                    conf,
                ),
            )

            f = fac_map.get(udise, {})
            water = nbool(f.get("water_available"))
            electricity = nbool(f.get("electricity_available"))
            internet = nbool(f.get("internet_available"))
            solar = nbool(f.get("solar_available"))
            playground = nbool(f.get("playground_available"))
            library = nbool(f.get("library_available"))
            ramps = nbool(f.get("ramps_available"))
            medical = nbool(f.get("medical_checkups"))
            tb = nint(f.get("functional_toilets_b"))
            tg = nint(f.get("functional_toilets_g"))
            desktops = nint(f.get("desktops"))
            laptops = nint(f.get("laptops"))
            tablets = nint(f.get("tablets"))
            printers = nint(f.get("printers"))
            smart_tv = nint(f.get("smart_class_tv"))
            projectors = nint(f.get("projectors"))

            cur.execute(
                """
                UPDATE "School" SET
                  "waterAvailable"=?,
                  "electricityAvailable"=?,
                  "internetAvailable"=?,
                  "solarAvailable"=?,
                  "playgroundAvailable"=?,
                  "libraryAvailable"=?,
                  "updatedAt"=CURRENT_TIMESTAMP
                WHERE "udise"=?
                """,
                (water, electricity, internet, solar, playground, library, udise),
            )

            cur.execute(
                """
                INSERT INTO "SchoolInfra" ("udise","functionalToiletsB","functionalToiletsG","rampsAvailable","medicalCheckup","updatedAt")
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT("udise") DO UPDATE SET
                  "functionalToiletsB"=excluded."functionalToiletsB",
                  "functionalToiletsG"=excluded."functionalToiletsG",
                  "rampsAvailable"=excluded."rampsAvailable",
                  "medicalCheckup"=excluded."medicalCheckup",
                  "updatedAt"=CURRENT_TIMESTAMP
                """,
                (udise, tb, tg, ramps, medical),
            )

            cur.execute(
                """
                INSERT INTO "SchoolDigitalFacilities" ("udise","smartClassTv","laptops","desktops","tablets","printers","updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT("udise") DO UPDATE SET
                  "smartClassTv"=excluded."smartClassTv",
                  "laptops"=excluded."laptops",
                  "desktops"=excluded."desktops",
                  "tablets"=excluded."tablets",
                  "printers"=excluded."printers",
                  "updatedAt"=CURRENT_TIMESTAMP
                """,
                (udise, smart_tv, laptops, desktops, tablets, printers),
            )

            for table in ["SchoolEnrolmentSocial", "SchoolEnrolmentMinority", "SchoolEnrolmentOthers", "SchoolEnrolmentAge"]:
                cur.execute(f'DELETE FROM "{table}" WHERE "udise"=?', (udise,))

            for r in social_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentSocial" ("id","udise","category","boys","girls","total","createdAt")
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], udise, nstr(r.get("category")), nint(r.get("boys")), nint(r.get("girls")), nint(r.get("total"))),
                )
            for r in minority_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentMinority" ("id","udise","category","boys","girls","total","createdAt")
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], udise, nstr(r.get("category")), nint(r.get("boys")), nint(r.get("girls")), nint(r.get("total"))),
                )
            for r in others_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentOthers" ("id","udise","category","boys","girls","total","createdAt")
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], udise, nstr(r.get("category")), nint(r.get("boys")), nint(r.get("girls")), nint(r.get("total"))),
                )
            for r in age_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentAge" ("id","udise","ageBand","boys","girls","total","createdAt")
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], udise, nstr(r.get("age_band")), nint(r.get("boys")), nint(r.get("girls")), nint(r.get("total"))),
                )

            imported += 1

    con.close()
    print(f"Imported {imported} school records from master workbook into dev.db")


if __name__ == "__main__":
    main()
