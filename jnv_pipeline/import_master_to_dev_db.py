from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
MASTER_XLSX = ROOT / "jnv_pipeline" / "output" / "JNV_bulk_import_ready_MASTER.xlsx"
DEV_DB = ROOT / "jnv-platform" / "apps" / "api" / "prisma" / "dev.db"
EXTRACTIONS_DIR = ROOT / "jnv-platform" / "tools" / "pmshri-crawler" / "data" / "extractions"


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
    if v is None or (isinstance(v, float) and pd.isna(v)) or pd.isna(v):
        return None
    if type(v) is bool:
        return 1 if v else 0
    if isinstance(v, (int, float)):
        if isinstance(v, float) and pd.isna(v):
            return None
        try:
            iv = int(v)
        except (ValueError, OverflowError):
            return None
        if iv == 1:
            return 1
        if iv == 0:
            return 0
        return None
    s = nstr(v).lower()
    if s in {"true", "1", "yes", "y"}:
        return 1
    if s in {"false", "0", "no", "n"}:
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


def load_extractions_by_udise(ext_dir: Path) -> dict[str, dict]:
    """UDISE -> full crawler JSON (same shape as SchoolReportCardSnapshot.payload)."""
    out: dict[str, dict] = {}
    if not ext_dir.is_dir():
        return out
    for p in sorted(ext_dir.glob("*.json")):
        stem = p.stem.replace(".0", "")
        if len(stem) != 11 or not stem.isdigit():
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict):
            out[stem] = data
    return out


def upsert_report_card_snapshot_sqlite(
    cur: sqlite3.Cursor,
    udise: str,
    snap: dict,
    school_academic_year: str | None,
    school_conf: float | None,
) -> None:
    prov = snap.get("provenance") if isinstance(snap.get("provenance"), dict) else {}
    acad = nstr(prov.get("academicYear")) or (school_academic_year or None)
    acad = acad or None
    src_hash = nstr(prov.get("sourcePdfHash")) or "pipeline-excel-import"
    pdf_rel = nstr(prov.get("pdfRelativePath")) or f"tools/pmshri-crawler/data/extractions/{udise}.json"
    overall = school_conf
    if overall is None and isinstance(snap.get("confidenceBySection"), dict):
        nums = [float(x) for x in snap["confidenceBySection"].values() if isinstance(x, (int, float))]
        if nums:
            overall = float(sum(nums) / len(nums))
    if overall is None:
        overall = 0.5
    extracted_raw = prov.get("extractedAt")
    extracted_at: str | None
    if isinstance(extracted_raw, str) and extracted_raw.strip():
        extracted_at = extracted_raw.strip()
    else:
        extracted_at = None
    payload_str = json.dumps(snap, ensure_ascii=False)
    cur.execute(
        """
        INSERT INTO "SchoolReportCardSnapshot" (
          "udise","academicYear","sourcePdfHash","pdfRelativePath","screenshotRelativePath",
          "payload","overallConfidence","extractedAt","updatedAt"
        ) VALUES (?,?,?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)
        ON CONFLICT("udise") DO UPDATE SET
          "academicYear"=excluded."academicYear",
          "sourcePdfHash"=excluded."sourcePdfHash",
          "pdfRelativePath"=excluded."pdfRelativePath",
          "payload"=excluded."payload",
          "overallConfidence"=excluded."overallConfidence",
          "extractedAt"=excluded."extractedAt",
          "updatedAt"=CURRENT_TIMESTAMP
        """,
        (udise, acad, src_hash, pdf_rel, None, payload_str, overall, extracted_at),
    )


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
    teachers = pd.read_excel(MASTER_XLSX, sheet_name="teachers", dtype=object)
    facilities = pd.read_excel(MASTER_XLSX, sheet_name="facilities", dtype=object)

    social_map = group_by_udise(social)
    minority_map = group_by_udise(minority)
    others_map = group_by_udise(others)
    age_map = group_by_udise(age)
    teachers_map = group_by_udise(teachers)
    fac_map = {nudise(r.get("udise")): r.to_dict() for _, r in facilities.iterrows() if nudise(r.get("udise"))}
    extraction_by_udise = load_extractions_by_udise(EXTRACTIONS_DIR)

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

            if udise in fac_map:
                f = fac_map[udise]
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
                extra_payload: dict[str, int] = {}
                if projectors is not None:
                    extra_payload["projectors"] = projectors
                extra_json = json.dumps(extra_payload) if extra_payload else None

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
                    INSERT INTO "SchoolDigitalFacilities" ("udise","smartClassTv","laptops","desktops","tablets","printers","extra","updatedAt")
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT("udise") DO UPDATE SET
                      "smartClassTv"=excluded."smartClassTv",
                      "laptops"=excluded."laptops",
                      "desktops"=excluded."desktops",
                      "tablets"=excluded."tablets",
                      "printers"=excluded."printers",
                      "extra"=CASE WHEN excluded."extra" IS NOT NULL THEN excluded."extra" ELSE "SchoolDigitalFacilities"."extra" END,
                      "updatedAt"=CURRENT_TIMESTAMP
                    """,
                    (udise, smart_tv, laptops, desktops, tablets, printers, extra_json),
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
            
            cur.execute('DELETE FROM "SchoolTeacherBreakdown" WHERE "udise"=?', (udise,))
            for r in teachers_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolTeacherBreakdown" ("id","udise","category","label","count","createdAt")
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], udise, nstr(r.get("category")), nstr(r.get("label")), nint(r.get("count"))),
                )

            snap = extraction_by_udise.get(udise)
            if isinstance(snap, dict) and snap:
                upsert_report_card_snapshot_sqlite(cur, udise, snap, academic_year or None, conf)

            imported += 1

    con.close()
    print(f"Imported {imported} school records from master workbook into dev.db")


if __name__ == "__main__":
    main()
