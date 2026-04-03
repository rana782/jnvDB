"""Re-parse all PDFs in a folder and write JSON (ignores manifest). For large folders, run in a screen/tmux session."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from tqdm import tqdm
except Exception:  # pragma: no cover
    tqdm = None  # type: ignore[misc,assignment]

from jnv_pipeline.json_output import build_json_record, validate_json_record
from jnv_pipeline.parse_pdf import parse_pdf_file


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-dir", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, required=True)
    ap.add_argument("--batch-jsonl", action="store_true", help="Also write/append batch.jsonl")
    args = ap.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(args.pdf_dir.glob("*.pdf"))
    batch_path = args.output_dir / "batch.jsonl"
    if args.batch_jsonl and batch_path.exists():
        batch_path.unlink()

    iterator = tqdm(pdfs, desc="Rebuild JSON") if tqdm else pdfs
    for pdf in iterator:
        rec = parse_pdf_file(pdf)
        obj = build_json_record(rec)
        errs = validate_json_record(obj)
        if errs:
            continue
        out = args.output_dir / f"{pdf.stem}.json"
        out.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.batch_jsonl:
            with batch_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    print(f"Wrote {len(pdfs)} JSON files to {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
