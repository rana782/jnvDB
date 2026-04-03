from __future__ import annotations

import argparse
import json
from pathlib import Path

from .excel_writer import SHEET_HEADERS, write_workbook
from .validate import validate_sheet_headers


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if isinstance(obj, dict):
                rows.append(obj)
    return rows


def build_sheets(records: list[dict]) -> dict[str, list[dict]]:
    sheets: dict[str, list[dict]] = {k: [] for k in SHEET_HEADERS.keys()}

    def ordered(sheet: str, row: dict) -> dict:
        headers = SHEET_HEADERS[sheet]
        return {h: row.get(h) for h in headers}

    for rec in records:
        school = rec.get("schools") if isinstance(rec.get("schools"), dict) else {}
        source = rec.get("source") if isinstance(rec.get("source"), dict) else {}
        notes_raw = source.get("notes")
        if isinstance(notes_raw, list):
            notes = " | ".join(str(x) for x in notes_raw if x is not None)
        else:
            notes = ""
        sheets["schools"].append(
            ordered(
                "schools",
                {
                    "udise": school.get("udise"),
                    "school_name": school.get("school_name"),
                    "state": school.get("state"),
                    "district": school.get("district"),
                    "region_code": "",
                    "region_name": "",
                    "academic_year": school.get("academic_year"),
                    "total_students": school.get("total_students"),
                    "total_boys": school.get("total_boys"),
                    "total_girls": school.get("total_girls"),
                    "source_pdf_name": school.get("source_pdf_name") or source.get("pdf_name"),
                    "parse_confidence": school.get("parse_confidence"),
                    "notes": notes,
                },
            )
        )

        for key in ("enrolment_social", "enrolment_minority", "enrolment_others", "enrolment_age"):
            arr = rec.get(key)
            if isinstance(arr, list):
                for row in arr:
                    if isinstance(row, dict):
                        sheets[key].append(ordered(key, row))

        fac = rec.get("facilities")
        if isinstance(fac, dict):
            sheets["facilities"].append(ordered("facilities", fac))

        # Pipeline JSON currently does not include teacher rows.
        # Keep sheet present/empty to satisfy importer expectations.

    return sheets


def main() -> int:
    root = _repo_root()
    p = argparse.ArgumentParser(description="Build JNV master workbook from pipeline batch.jsonl.")
    p.add_argument(
        "--jsonl",
        type=Path,
        default=root / "jnv_pipeline" / "output" / "json_full" / "batch.jsonl",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=root / "jnv_pipeline" / "output" / "JNV_bulk_import_ready_MASTER.xlsx",
    )
    args = p.parse_args()

    jsonl = args.jsonl.resolve()
    out = args.output.resolve()
    if not jsonl.exists():
        raise FileNotFoundError(f"batch.jsonl not found: {jsonl}")

    records = _load_jsonl(jsonl)
    sheets = build_sheets(records)
    header_errors = validate_sheet_headers(sheets, SHEET_HEADERS)
    if header_errors:
        raise RuntimeError("Workbook header validation failed: " + "; ".join(header_errors))
    write_workbook(sheets, out)
    print(f"Wrote {out} ({len(records)} records from {jsonl})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
