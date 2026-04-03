"""
One-time static JSON -> PostgreSQL ingestion.

Reads extracted JSON records (single file, folder of .json, or JSONL),
validates the contract, and upserts into DB with UDISE as unique key.
No PDF parsing/OCR is used here.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Iterable

from .utils import append_jsonl

try:
    import psycopg2
    from psycopg2 import extensions as pg_ext
    from psycopg2.extras import Json as pg_json
except ImportError as e:
    print("Install Postgres driver: pip install psycopg2-binary", file=sys.stderr)
    raise SystemExit(1) from e


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_INPUT_DIR = SCRIPT_DIR / "output" / "json_full"
DEFAULT_MANIFEST = REPO_ROOT / "jnv_pipeline_state" / "json_seed_manifest.json"
DEFAULT_LOG = REPO_ROOT / "jnv_pipeline_state" / "json_seed_log.jsonl"

SOCIAL_ALLOWED = {"SC", "ST", "OBC", "General", "Total"}
MINORITY_ALLOWED = {"Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi", "Other", "Total"}
OTHERS_ALLOWED = {"BPL", "Repeater", "CWSN", "EWS", "RTE", "Total"}
AGE_ALLOWED = {str(x) for x in range(10, 19)} | {"Total"}


def nstr(v: object) -> str:
    return str(v).strip() if v is not None else ""


def nint(v: object) -> int | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        if v != v:  # NaN
            return None
        return int(v)
    s = nstr(v).replace(",", "")
    if s == "":
        return None
    try:
        return int(float(s))
    except Exception:
        return None


def nfloat(v: object) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = nstr(v)
    if s == "":
        return None
    try:
        return float(s)
    except Exception:
        return None


def to_bool(v: object) -> bool | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    s = nstr(v).lower()
    if s in {"true", "1", "yes", "y"}:
        return True
    if s in {"false", "0", "no", "n"}:
        return False
    return None


def load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"processed_sources": [], "failed_sources": [], "processed_udise": [], "last_batch": 0}
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("processed_sources", [])
    data.setdefault("failed_sources", [])
    data.setdefault("processed_udise", [])
    data.setdefault("last_batch", 0)
    return data


def save_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")


def _row_totals_by_label(
    arr: object, label_key: str, label: str
) -> tuple[int | None, int | None, int | None]:
    """Return (boys, girls, total) from the first row whose label matches."""
    if not isinstance(arr, list):
        return None, None, None
    for r in arr:
        if not isinstance(r, dict):
            continue
        if nstr(r.get(label_key)) != label:
            continue
        return nint(r.get("boys")), nint(r.get("girls")), nint(r.get("total"))
    return None, None, None


def normalize_record_for_import(obj: dict[str, Any]) -> None:
    """
    Fill gaps in schools.* from enrolment tables so strict PDF gaps do not block seeding.
    Mutates obj in place.
    """
    schools = obj.get("schools")
    if not isinstance(schools, dict):
        return
    if nstr(schools.get("academic_year")) == "":
        schools["academic_year"] = None

    if nint(schools.get("total_students")) is None:
        for key, lk, lab in (
            ("enrolment_age", "age_band", "Total"),
            ("enrolment_social", "category", "Total"),
            ("enrolment_minority", "category", "Total"),
            ("enrolment_others", "category", "Total"),
        ):
            _b, _g, t = _row_totals_by_label(obj.get(key), lk, lab)
            if t is not None:
                schools["total_students"] = t
                break

    if nint(schools.get("total_boys")) is None or nint(schools.get("total_girls")) is None:
        b, g, _t = _row_totals_by_label(obj.get("enrolment_social"), "category", "Total")
        if nint(schools.get("total_boys")) is None and b is not None:
            schools["total_boys"] = b
        if nint(schools.get("total_girls")) is None and g is not None:
            schools["total_girls"] = g


def validate_record(obj: dict[str, Any]) -> list[str]:
    errs: list[str] = []
    schools = obj.get("schools")
    if not isinstance(schools, dict):
        return ["schools must be an object"]
    required = [
        "udise",
        "school_name",
        "state",
        "district",
        "source_pdf_name",
        "parse_confidence",
    ]
    for k in required:
        if schools.get(k) in (None, ""):
            errs.append(f"schools.{k} is required")
    if nint(schools.get("total_students")) is None:
        errs.append("schools.total_students is required (missing and could not be derived from enrolment Total rows)")
    udise = nstr(schools.get("udise"))
    if not (len(udise) == 11 and udise.isdigit()):
        errs.append("schools.udise must be exactly 11 digits")
    conf = nfloat(schools.get("parse_confidence"))
    if conf is None or conf < 0 or conf > 1:
        errs.append("schools.parse_confidence must be between 0 and 1")

    def check_rows(arr_key: str, allowed_set: set[str], label_key: str) -> None:
        arr = obj.get(arr_key)
        if not isinstance(arr, list):
            errs.append(f"{arr_key} must be a list")
            return
        for i, r in enumerate(arr):
            if not isinstance(r, dict):
                errs.append(f"{arr_key}[{i}] must be an object")
                continue
            if nstr(r.get("udise")) != udise:
                errs.append(f"{arr_key}[{i}].udise must match schools.udise")
            label = nstr(r.get(label_key))
            if label not in allowed_set:
                errs.append(f"{arr_key}[{i}].{label_key} invalid: {label!r}")
            for nkey in ("boys", "girls", "total"):
                val = r.get(nkey)
                if val is not None and nint(val) is None:
                    errs.append(f"{arr_key}[{i}].{nkey} must be integer or null")

    check_rows("enrolment_social", SOCIAL_ALLOWED, "category")
    check_rows("enrolment_minority", MINORITY_ALLOWED, "category")
    check_rows("enrolment_others", OTHERS_ALLOWED, "category")
    check_rows("enrolment_age", AGE_ALLOWED, "age_band")

    fac = obj.get("facilities")
    if not isinstance(fac, dict):
        errs.append("facilities must be an object")
    else:
        if nstr(fac.get("udise")) != udise:
            errs.append("facilities.udise must match schools.udise")
        for b in [
            "water_available",
            "electricity_available",
            "internet_available",
            "solar_available",
            "playground_available",
            "library_available",
        ]:
            if fac.get(b) is not None and to_bool(fac.get(b)) is None:
                errs.append(f"facilities.{b} must be boolean or null")
        for n in [
            "functional_toilets_b",
            "functional_toilets_g",
            "desktops",
            "laptops",
            "tablets",
            "printers",
            "smart_class_tv",
            "projectors",
        ]:
            if fac.get(n) is not None and nint(fac.get(n)) is None:
                errs.append(f"facilities.{n} must be integer or null")
    return errs


def iter_sources(args: argparse.Namespace) -> Iterable[tuple[str, dict[str, Any]]]:
    if args.input_file:
        p = args.input_file.resolve()
        yield (str(p), json.loads(p.read_text(encoding="utf-8")))
        return
    if args.input_jsonl:
        p = args.input_jsonl.resolve()
        with p.open("r", encoding="utf-8") as f:
            for i, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                if isinstance(obj, dict):
                    yield (f"{p}#L{i}", obj)
        return
    src_dir = args.input_dir.resolve()
    for p in sorted(src_dir.glob("*.json")):
        if p.name == "batch.jsonl":
            continue
        yield (str(p), json.loads(p.read_text(encoding="utf-8")))


def resolve_state_id(state: str, state_map: dict[str, str]) -> str | None:
    if not state:
        return None
    key = " ".join(state.lower().replace(".", " ").split())
    return state_map.get(key)


def upsert_record(cur: Any, rec: dict[str, Any], state_map: dict[str, str]) -> None:
    school = rec["schools"]
    udise = nstr(school["udise"])
    state = nstr(school.get("state"))
    district = nstr(school.get("district"))
    state_id = resolve_state_id(state, state_map)
    source_pdf_name = nstr(school.get("source_pdf_name"))
    pdf_rel = f"tools/pmshri-crawler/data/pdfs/{source_pdf_name}" if source_pdf_name else None
    src_hash = f"json-seed:{udise}"

    lat = nfloat(school.get("latitude"))
    lon = nfloat(school.get("longitude"))

    cur.execute(
        """
        INSERT INTO "School" (
          "udise","schoolName","geographicState","geographicDistrict",
          "stateId","academicYear","totalStudents","totalBoys","totalGirls",
          "latitude","longitude",
          "pdfRelativePath","sourcePdfHash","parsingStatus","extractorVersion","overallExtractionConfidence","updatedAt"
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'COMPLETE','jnv_json_seed.1.0',%s,CURRENT_TIMESTAMP)
        ON CONFLICT("udise") DO UPDATE SET
          "schoolName"=EXCLUDED."schoolName",
          "geographicState"=EXCLUDED."geographicState",
          "geographicDistrict"=EXCLUDED."geographicDistrict",
          "stateId"=COALESCE(EXCLUDED."stateId","School"."stateId"),
          "academicYear"=EXCLUDED."academicYear",
          "totalStudents"=EXCLUDED."totalStudents",
          "totalBoys"=EXCLUDED."totalBoys",
          "totalGirls"=EXCLUDED."totalGirls",
          "latitude"=COALESCE(EXCLUDED."latitude","School"."latitude"),
          "longitude"=COALESCE(EXCLUDED."longitude","School"."longitude"),
          "pdfRelativePath"=COALESCE(EXCLUDED."pdfRelativePath","School"."pdfRelativePath"),
          "sourcePdfHash"=COALESCE(EXCLUDED."sourcePdfHash","School"."sourcePdfHash"),
          "parsingStatus"='COMPLETE',
          "overallExtractionConfidence"=EXCLUDED."overallExtractionConfidence",
          "updatedAt"=CURRENT_TIMESTAMP
        """,
        (
            udise,
            nstr(school.get("school_name")) or f"JAWAHAR NAVODAYA VIDYALAYA {udise}",
            state or None,
            district or None,
            state_id,
            nstr(school.get("academic_year")) or None,
            nint(school.get("total_students")),
            nint(school.get("total_boys")),
            nint(school.get("total_girls")),
            lat,
            lon,
            pdf_rel,
            src_hash,
            nfloat(school.get("parse_confidence")),
        ),
    )

    fac = rec.get("facilities") or {}
    extra_payload: dict[str, int] = {}
    proj = nint(fac.get("projectors"))
    if proj is not None:
        extra_payload["projectors"] = proj
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
        (
            to_bool(fac.get("water_available")),
            to_bool(fac.get("electricity_available")),
            to_bool(fac.get("internet_available")),
            to_bool(fac.get("solar_available")),
            to_bool(fac.get("playground_available")),
            to_bool(fac.get("library_available")),
            udise,
        ),
    )
    cur.execute(
        """
        INSERT INTO "SchoolInfra" ("udise","functionalToiletsB","functionalToiletsG","rampsAvailable","medicalCheckup","updatedAt")
        VALUES (%s,%s,%s,%s,%s,CURRENT_TIMESTAMP)
        ON CONFLICT("udise") DO UPDATE SET
          "functionalToiletsB"=EXCLUDED."functionalToiletsB",
          "functionalToiletsG"=EXCLUDED."functionalToiletsG",
          "rampsAvailable"=EXCLUDED."rampsAvailable",
          "medicalCheckup"=EXCLUDED."medicalCheckup",
          "updatedAt"=CURRENT_TIMESTAMP
        """,
        (udise, nint(fac.get("functional_toilets_b")), nint(fac.get("functional_toilets_g")), to_bool(fac.get("ramps_available")), to_bool(fac.get("medical_checkups"))),
    )
    cur.execute(
        """
        INSERT INTO "SchoolDigitalFacilities" ("udise","smartClassTv","laptops","desktops","tablets","printers","extra","updatedAt")
        VALUES (%s,%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP)
        ON CONFLICT("udise") DO UPDATE SET
          "smartClassTv"=EXCLUDED."smartClassTv",
          "laptops"=EXCLUDED."laptops",
          "desktops"=EXCLUDED."desktops",
          "tablets"=EXCLUDED."tablets",
          "printers"=EXCLUDED."printers",
          "extra"=CASE WHEN EXCLUDED."extra" IS NOT NULL THEN EXCLUDED."extra" ELSE "SchoolDigitalFacilities"."extra" END,
          "updatedAt"=CURRENT_TIMESTAMP
        """,
        (udise, nint(fac.get("smart_class_tv")), nint(fac.get("laptops")), nint(fac.get("desktops")), nint(fac.get("tablets")), nint(fac.get("printers")), extra_val),
    )

    for table in ["SchoolEnrolmentSocial", "SchoolEnrolmentMinority", "SchoolEnrolmentOthers", "SchoolEnrolmentAge", "SchoolTeacherBreakdown"]:
        cur.execute(f'DELETE FROM "{table}" WHERE "udise"=%s', (udise,))

    def insert_rows(table: str, rows: list[dict[str, Any]], label_key: str) -> None:
        for r in rows:
            label = nstr(r.get(label_key))
            if not label:
                continue
            if table == "SchoolEnrolmentAge":
                cur.execute(
                    """
                    INSERT INTO "SchoolEnrolmentAge" ("id","udise","ageBand","boys","girls","total","createdAt")
                    VALUES (%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP)
                    """,
                    (uuid.uuid4().hex[:25], udise, label, nint(r.get("boys")), nint(r.get("girls")), nint(r.get("total"))),
                )
            else:
                cur.execute(
                    f'INSERT INTO "{table}" ("id","udise","category","boys","girls","total","createdAt") VALUES (%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP)',
                    (uuid.uuid4().hex[:25], udise, label, nint(r.get("boys")), nint(r.get("girls")), nint(r.get("total"))),
                )

    insert_rows("SchoolEnrolmentSocial", rec.get("enrolment_social") or [], "category")
    insert_rows("SchoolEnrolmentMinority", rec.get("enrolment_minority") or [], "category")
    insert_rows("SchoolEnrolmentOthers", rec.get("enrolment_others") or [], "category")
    insert_rows("SchoolEnrolmentAge", rec.get("enrolment_age") or [], "age_band")

    source = rec.get("source") if isinstance(rec.get("source"), dict) else None
    if source:
        payload = {"seed_source": "static_json", "record": rec}
        cur.execute(
            """
            INSERT INTO "SchoolReportCardSnapshot" (
              "udise","academicYear","sourcePdfHash","pdfRelativePath","screenshotRelativePath",
              "payload","overallConfidence","extractedAt","updatedAt"
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            ON CONFLICT("udise") DO UPDATE SET
              "academicYear"=EXCLUDED."academicYear",
              "sourcePdfHash"=EXCLUDED."sourcePdfHash",
              "pdfRelativePath"=EXCLUDED."pdfRelativePath",
              "payload"=EXCLUDED."payload",
              "overallConfidence"=EXCLUDED."overallConfidence",
              "updatedAt"=CURRENT_TIMESTAMP
            """,
            (
                udise,
                nstr(school.get("academic_year")) or None,
                src_hash,
                pdf_rel or f"tools/pmshri-crawler/data/pdfs/{udise}.pdf",
                None,
                pg_json(payload),
                nfloat(school.get("parse_confidence")) or 0.0,
            ),
        )


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="One-time static JSON -> PostgreSQL ingestion")
    src = p.add_mutually_exclusive_group(required=False)
    src.add_argument("--input-file", type=Path, help="Single extracted JSON file")
    src.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR, help="Folder with extracted JSON files")
    src.add_argument("--input-jsonl", type=Path, help="JSONL file where each line is one extracted JSON record")
    p.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    p.add_argument("--log-file", type=Path, default=DEFAULT_LOG)
    p.add_argument("--batch-size", type=int, default=200, help="Progress log interval")
    p.add_argument("--force", action="store_true", help="Ignore manifest resume and ingest all sources again")
    p.add_argument("--validate-only", action="store_true", help="Validate input and log results without DB writes")
    return p


def main() -> int:
    args = build_parser().parse_args()
    try:
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    except Exception:
        pass
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not args.validate_only and not dsn:
        print("Set DATABASE_URL to your PostgreSQL connection string.", file=sys.stderr)
        return 2

    manifest = load_manifest(args.manifest)
    done_sources = set(str(x) for x in manifest.get("processed_sources", []))
    done_udise = set(str(x) for x in manifest.get("processed_udise", []))
    seen_udise_this_run: set[str] = set()

    conn = None
    cur = None
    state_map: dict[str, str] = {}
    if not args.validate_only:
        conn = psycopg2.connect(dsn)
        conn.set_isolation_level(pg_ext.ISOLATION_LEVEL_READ_COMMITTED)
        cur = conn.cursor()
        cur.execute('SELECT "id","name","normalizedName" FROM "State"')
        for sid, name, norm in cur.fetchall():
            key1 = " ".join(str(name).lower().replace(".", " ").split())
            key2 = " ".join(str(norm).lower().replace(".", " ").split())
            state_map[key1] = sid
            state_map[key2] = sid

    processed = skipped_resume = skipped_duplicate = failed = 0
    batch_no = int(manifest.get("last_batch", 0)) + 1

    for i, (source_id, obj) in enumerate(iter_sources(args), start=1):
        source_key = str(source_id)
        log_obj: dict[str, Any] = {"source": source_key, "status": "ok", "errors": []}
        try:
            if not args.force and source_key in done_sources:
                skipped_resume += 1
                log_obj["status"] = "skipped_resume"
                append_jsonl(args.log_file, log_obj)
                continue
            if not isinstance(obj, dict):
                raise ValueError("root JSON must be an object")
            normalize_record_for_import(obj)
            errs = validate_record(obj)
            if errs:
                raise ValueError("; ".join(errs))

            udise = nstr((obj.get("schools") or {}).get("udise"))
            if udise in seen_udise_this_run:
                skipped_duplicate += 1
                log_obj["status"] = "skipped_duplicate_udise_in_batch"
                append_jsonl(args.log_file, log_obj)
                continue
            seen_udise_this_run.add(udise)

            if not args.validate_only:
                assert cur is not None and conn is not None
                try:
                    upsert_record(cur, obj, state_map)
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise
            processed += 1
            done_sources.add(source_key)
            done_udise.add(udise)
        except Exception as exc:
            failed += 1
            log_obj["status"] = "failed"
            log_obj["errors"] = [str(exc)]
            manifest["failed_sources"] = sorted(set(manifest.get("failed_sources", [])) | {source_key})
        finally:
            append_jsonl(args.log_file, log_obj)
            if i % max(1, args.batch_size) == 0:
                print(
                    f"batch {batch_no}: scanned={i} processed={processed} failed={failed} skipped_resume={skipped_resume} skipped_dup={skipped_duplicate}",
                    flush=True,
                )

    manifest["processed_sources"] = sorted(done_sources)
    manifest["processed_udise"] = sorted(done_udise)
    manifest["last_batch"] = batch_no
    save_manifest(args.manifest, manifest)

    if cur is not None:
        cur.close()
    if conn is not None:
        conn.close()

    print(
        "Done:",
        json.dumps(
            {
                "processed": processed,
                "failed": failed,
                "skipped_resume": skipped_resume,
                "skipped_duplicate_udise_in_batch": skipped_duplicate,
                "manifest": str(args.manifest),
                "log_file": str(args.log_file),
                "validate_only": bool(args.validate_only),
            },
            ensure_ascii=True,
        ),
        flush=True,
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

