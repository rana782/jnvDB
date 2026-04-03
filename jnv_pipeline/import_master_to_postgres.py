"""
Load bulk Excel (same layout as import_master_to_dev_db.py) into PostgreSQL.

No PDF extraction — uses only JNV_bulk_import_ready_MASTER.xlsx (6 sheets).

Usage (PowerShell):
  $env:DATABASE_URL = "postgresql://..."   # Render external URL
  py jnv_pipeline/import_master_to_postgres.py
  py jnv_pipeline/import_master_to_postgres.py --xlsx "C:\\path\\to\\MASTER.xlsx"

After import, refresh map/dashboard derivations (from jnv-platform with Prisma on postgres):
  npm run dev:reconcile-dashboard -w @jnv/api

Do NOT commit database binaries to Git — commit the .xlsx if you want CI to replay the import.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

import pandas as pd

try:
    import psycopg2
    from psycopg2 import extensions as pg_ext
    from psycopg2.extras import Json as pg_json
except ImportError as e:
    print("Install Postgres driver: pip install psycopg2-binary", file=sys.stderr)
    raise SystemExit(1) from e


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_MASTER = SCRIPT_DIR / "output" / "JNV_bulk_import_ready_MASTER.xlsx"
DEFAULT_EXTRACTIONS = REPO_ROOT / "jnv-platform" / "tools" / "pmshri-crawler" / "data" / "extractions"

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


def pg_bool(v: int | None) -> bool | None:
    if v is None:
        return None
    return bool(v)


def normalize_state(v: object) -> str:
    s = " ".join(nstr(v).lower().replace(".", " ").split())
    if s in ALIASES:
        s = ALIASES[s]
    return s


def pdf_relative_path_from_row(row: object) -> str | None:
    """Optional Excel columns: pdf_relative_path, pdfRelativePath, pdf_path, pdfPath."""
    if not hasattr(row, "get"):
        return None
    r = row  # pandas Series
    for key in ("pdf_relative_path", "pdfRelativePath", "pdf_path", "pdfPath"):
        v = nstr(r.get(key))
        if v:
            return v
    return None


def source_pdf_hash_from_row(row: object, udise: str, pdf_rel: str | None) -> str | None:
    if not hasattr(row, "get"):
        return None
    r = row
    h = nstr(r.get("source_pdf_hash")) or nstr(r.get("sourcePdfHash"))
    if h:
        return h
    if pdf_rel:
        return f"excel:{udise}"
    return None


def resolve_state_id(state: str, state_map: dict[str, str]) -> str | None:
    if not state:
        return None
    n = normalize_state(state)
    if n in state_map:
        return state_map[n]
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


def main() -> None:
    p = argparse.ArgumentParser(description="Import bulk Excel into PostgreSQL (no PDF pipeline).")
    p.add_argument(
        "--xlsx",
        type=Path,
        default=DEFAULT_MASTER,
        help=f"Path to JNV_bulk_import_ready_MASTER.xlsx (default: {DEFAULT_MASTER})",
    )
    p.add_argument(
        "--extractions",
        type=Path,
        default=DEFAULT_EXTRACTIONS,
        help="Crawler extraction JSON directory (used to upsert SchoolReportCardSnapshot per UDISE)",
    )
    args = p.parse_args()
    master = args.xlsx.resolve()
    extractions_dir = args.extractions.resolve()

    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        print("Set DATABASE_URL to your PostgreSQL connection string.", file=sys.stderr)
        raise SystemExit(2)
    if not master.exists():
        raise FileNotFoundError(f"Master workbook not found: {master}")

    schools = pd.read_excel(master, sheet_name="schools", dtype=object)
    social = pd.read_excel(master, sheet_name="enrolment_social", dtype=object)
    minority = pd.read_excel(master, sheet_name="enrolment_minority", dtype=object)
    others = pd.read_excel(master, sheet_name="enrolment_others", dtype=object)
    age = pd.read_excel(master, sheet_name="enrolment_age", dtype=object)
    teachers = pd.read_excel(master, sheet_name="teachers", dtype=object)
    facilities = pd.read_excel(master, sheet_name="facilities", dtype=object)

    social_map = group_by_udise(social)
    minority_map = group_by_udise(minority)
    others_map = group_by_udise(others)
    age_map = group_by_udise(age)
    teachers_map = group_by_udise(teachers)
    fac_map = {nudise(r.get("udise")): r.to_dict() for _, r in facilities.iterrows() if nudise(r.get("udise"))}
    extraction_by_udise = load_extractions_by_udise(extractions_dir)

    conn = psycopg2.connect(dsn)
    conn.set_isolation_level(pg_ext.ISOLATION_LEVEL_READ_COMMITTED)
    cur = conn.cursor()

    cur.execute('SELECT "id","name","normalizedName" FROM "State"')
    state_map: dict[str, str] = {}
    for sid, name, norm in cur.fetchall():
        state_map[normalize_state(name)] = sid
        state_map[normalize_state(norm)] = sid

    imported = 0
    try:
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
            pdf_rel = pdf_relative_path_from_row(row)
            src_hash = source_pdf_hash_from_row(row, udise, pdf_rel)

            cur.execute(
                """
                INSERT INTO "School" (
                  "udise","schoolName","geographicState","geographicDistrict",
                  "stateId","academicYear","totalStudents","totalBoys","totalGirls",
                  "pdfRelativePath","sourcePdfHash",
                  "parsingStatus","extractorVersion","overallExtractionConfidence","updatedAt"
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'COMPLETE', 'jnv_pipeline.1.0', %s, CURRENT_TIMESTAMP)
                ON CONFLICT("udise") DO UPDATE SET
                  "schoolName"=EXCLUDED."schoolName",
                  "geographicState"=EXCLUDED."geographicState",
                  "geographicDistrict"=EXCLUDED."geographicDistrict",
                  "stateId"=COALESCE(EXCLUDED."stateId","School"."stateId"),
                  "academicYear"=EXCLUDED."academicYear",
                  "totalStudents"=EXCLUDED."totalStudents",
                  "totalBoys"=EXCLUDED."totalBoys",
                  "totalGirls"=EXCLUDED."totalGirls",
                  "pdfRelativePath"=COALESCE(EXCLUDED."pdfRelativePath","School"."pdfRelativePath"),
                  "sourcePdfHash"=COALESCE(EXCLUDED."sourcePdfHash","School"."sourcePdfHash"),
                  "parsingStatus"='COMPLETE',
                  "overallExtractionConfidence"=EXCLUDED."overallExtractionConfidence",
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
                    pdf_rel,
                    src_hash,
                    conf,
                ),
            )

            if udise in fac_map:
                f = fac_map[udise]
                water = pg_bool(nbool(f.get("water_available")))
                electricity = pg_bool(nbool(f.get("electricity_available")))
                internet = pg_bool(nbool(f.get("internet_available")))
                solar = pg_bool(nbool(f.get("solar_available")))
                playground = pg_bool(nbool(f.get("playground_available")))
                library = pg_bool(nbool(f.get("library_available")))
                ramps = pg_bool(nbool(f.get("ramps_available")))
                medical = pg_bool(nbool(f.get("medical_checkups")))
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
                extra_val = pg_json(extra_payload) if extra_payload else None

                cur.execute(
                    """
                    UPDATE "School" SET
                      "waterAvailable"=%s,
                      "electricityAvailable"=%s,
                      "internetAvailable"=%s,
                      "solarAvailable"=%s,
                      "playgroundAvailable"=%s,
                      "libraryAvailable"=%s,
                      "updatedAt"=CURRENT_TIMESTAMP
                    WHERE "udise"=%s
                    """,
                    (water, electricity, internet, solar, playground, library, udise),
                )

                cur.execute(
                    """
                    INSERT INTO "SchoolInfra" ("udise","functionalToiletsB","functionalToiletsG","rampsAvailable","medicalCheckup","updatedAt")
                    VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT("udise") DO UPDATE SET
                      "functionalToiletsB"=EXCLUDED."functionalToiletsB",
                      "functionalToiletsG"=EXCLUDED."functionalToiletsG",
                      "rampsAvailable"=EXCLUDED."rampsAvailable",
                      "medicalCheckup"=EXCLUDED."medicalCheckup",
                      "updatedAt"=CURRENT_TIMESTAMP
                    """,
                    (udise, tb, tg, ramps, medical),
                )

                cur.execute(
                    """
                    INSERT INTO "SchoolDigitalFacilities" ("udise","smartClassTv","laptops","desktops","tablets","printers","extra","updatedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT("udise") DO UPDATE SET
                      "smartClassTv"=EXCLUDED."smartClassTv",
                      "laptops"=EXCLUDED."laptops",
                      "desktops"=EXCLUDED."desktops",
                      "tablets"=EXCLUDED."tablets",
                      "printers"=EXCLUDED."printers",
                      "extra"=CASE WHEN EXCLUDED."extra" IS NOT NULL THEN EXCLUDED."extra" ELSE "SchoolDigitalFacilities"."extra" END,
                      "updatedAt"=CURRENT_TIMESTAMP
                    """,
                    (udise, smart_tv, laptops, desktops, tablets, printers, extra_val),
                )

            for table in ["SchoolEnrolmentSocial", "SchoolEnrolmentMinority", "SchoolEnrolmentOthers", "SchoolEnrolmentAge", "SchoolTeacherBreakdown"]:
                cur.execute(f'DELETE FROM "{table}" WHERE "udise"=%s', (udise,))

            for r in social_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentSocial" ("id","udise","category","boys","girls","total","createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    """,
                    (
                        uuid.uuid4().hex[:25],
                        udise,
                        nstr(r.get("category")),
                        nint(r.get("boys")),
                        nint(r.get("girls")),
                        nint(r.get("total")),
                    ),
                )
            for r in minority_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentMinority" ("id","udise","category","boys","girls","total","createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    """,
                    (
                        uuid.uuid4().hex[:25],
                        udise,
                        nstr(r.get("category")),
                        nint(r.get("boys")),
                        nint(r.get("girls")),
                        nint(r.get("total")),
                    ),
                )
            for r in others_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentOthers" ("id","udise","category","boys","girls","total","createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    """,
                    (
                        uuid.uuid4().hex[:25],
                        udise,
                        nstr(r.get("category")),
                        nint(r.get("boys")),
                        nint(r.get("girls")),
                        nint(r.get("total")),
                    ),
                )
            for r in age_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentAge" ("id","udise","ageBand","boys","girls","total","createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    """,
                    (
                        uuid.uuid4().hex[:25],
                        udise,
                        nstr(r.get("age_band")),
                        nint(r.get("boys")),
                        nint(r.get("girls")),
                        nint(r.get("total")),
                    ),
                )
            for r in teachers_map.get(udise, []):
                cur.execute(
                    """
                    INSERT INTO "SchoolTeacherBreakdown" ("id","udise","category","label","count","createdAt")
                    VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    """,
                    (
                        uuid.uuid4().hex[:25],
                        udise,
                        nstr(r.get("category")),
                        nstr(r.get("label")),
                        nint(r.get("count")),
                    ),
                )

            snap = extraction_by_udise.get(udise)
            if isinstance(snap, dict) and snap:
                prov = snap.get("provenance") if isinstance(snap.get("provenance"), dict) else {}
                acad = nstr(prov.get("academicYear")) or (academic_year or None)
                acad = acad or None
                src_hash = nstr(prov.get("sourcePdfHash")) or "pipeline-excel-import"
                pdf_rel = nstr(prov.get("pdfRelativePath")) or f"tools/pmshri-crawler/data/extractions/{udise}.json"
                overall = conf
                if overall is None and isinstance(snap.get("confidenceBySection"), dict):
                    nums = [float(x) for x in snap["confidenceBySection"].values() if isinstance(x, (int, float))]
                    if nums:
                        overall = float(sum(nums) / len(nums))
                if overall is None:
                    overall = 0.5
                extracted_raw = prov.get("extractedAt")
                extracted_at = extracted_raw.strip() if isinstance(extracted_raw, str) and extracted_raw.strip() else None
                cur.execute(
                    """
                    INSERT INTO "SchoolReportCardSnapshot" (
                      "udise","academicYear","sourcePdfHash","pdfRelativePath","screenshotRelativePath",
                      "payload","overallConfidence","extractedAt","updatedAt"
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,COALESCE(%s::timestamptz, CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)
                    ON CONFLICT("udise") DO UPDATE SET
                      "academicYear"=EXCLUDED."academicYear",
                      "sourcePdfHash"=EXCLUDED."sourcePdfHash",
                      "pdfRelativePath"=EXCLUDED."pdfRelativePath",
                      "payload"=EXCLUDED."payload",
                      "overallConfidence"=EXCLUDED."overallConfidence",
                      "extractedAt"=EXCLUDED."extractedAt",
                      "updatedAt"=CURRENT_TIMESTAMP
                    """,
                    (
                        udise,
                        acad,
                        src_hash,
                        pdf_rel,
                        None,
                        pg_json(snap),
                        overall,
                        extracted_at,
                    ),
                )

            imported += 1

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    print(f"Imported {imported} school rows from {master} into PostgreSQL.")


if __name__ == "__main__":
    main()
