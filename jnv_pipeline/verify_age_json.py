"""
Compare enrolment_age in existing JSON files to a fresh parse from the matching PDF.
Run after rebuilding JSON from PDFs. Usage:

  set PYTHONPATH=repo_root
  python jnv_pipeline/verify_age_json.py --pdf-dir path/to/pdfs --json-dir path/to/json_full
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from jnv_pipeline.parse_text import extract_pdf_text
from jnv_pipeline.parse_tables import parse_age_section


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--pdf-dir", type=Path, required=True)
    p.add_argument("--json-dir", type=Path, required=True)
    p.add_argument("--limit", type=int, default=0, help="Max files to check (0=all)")
    args = p.parse_args()

    json_files = sorted(x for x in args.json_dir.glob("*.json") if x.name != "batch.jsonl")
    if args.limit:
        json_files = json_files[: args.limit]

    mismatches: list[str] = []
    missing_pdf = 0
    checked = 0
    for jp in json_files:
        udise = jp.stem
        pdf = args.pdf_dir / f"{udise}.pdf"
        if not pdf.exists():
            missing_pdf += 1
            continue
        text, _ = extract_pdf_text(pdf)
        fresh = {str(r["age_band"]): r for r in parse_age_section(text)}
        with jp.open(encoding="utf-8") as f:
            data = json.load(f)
        checked += 1
        for row in data.get("enrolment_age", []):
            band = str(row["age_band"])
            if band not in fresh:
                if row.get("total") is not None or row.get("boys") is not None:
                    mismatches.append(f"{udise} band={band}: json has values but PDF parse missing row")
                continue
            fr = fresh[band]
            for key in ("boys", "girls", "total"):
                jv, fv = row.get(key), fr.get(key)
                if jv != fv:
                    mismatches.append(f"{udise} band={band} {key}: json={jv!r} fresh={fv!r}")

    print(f"Checked JSON files with PDF: {checked}")
    print(f"Missing PDF for JSON: {missing_pdf}")
    print(f"Mismatches: {len(mismatches)}")
    for line in mismatches[:50]:
        print(" -", line)
    if len(mismatches) > 50:
        print(f" ... and {len(mismatches) - 50} more")
    return 1 if mismatches else 0


if __name__ == "__main__":
    raise SystemExit(main())
