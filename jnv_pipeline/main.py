from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from tqdm import tqdm
except Exception:  # pragma: no cover
    tqdm = None

from .config import PipelineConfig
from .json_output import build_json_record, validate_json_record, dumps_pretty
from .manifest import load_manifest, mark_failure, mark_success, save_manifest
from .normalize import dedupe_by_udise, normalize_school
from .parse_pdf import parse_pdf_file
from .utils import append_jsonl
from .validate import validate_record


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="JNV PDF to JSON ETL pipeline")
    p.add_argument("--input-dir", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--manifest", type=Path, default=Path("jnv_pipeline_state/manifest.json"))
    p.add_argument("--log-file", type=Path, default=Path("jnv_pipeline_state/processing_log.jsonl"))
    p.add_argument("--batch-size", type=int, default=50)
    p.add_argument("--no-recursive", action="store_true")
    p.add_argument("--demo-pdf", type=Path, default=None, help="Parse one PDF and print output summary")
    p.add_argument("--force-ocr", action="store_true", help="Always run OCR fallback")
    return p


def discover_pdfs(input_dir: Path, recursive: bool) -> list[Path]:
    pattern = "**/*.pdf" if recursive else "*.pdf"
    return sorted(input_dir.glob(pattern))


def run(config: PipelineConfig, force_ocr: bool = False) -> int:
    config.ensure_dirs()
    manifest = load_manifest(config.manifest_path)
    all_pdfs = discover_pdfs(config.input_dir, config.recursive)
    already = set(manifest["processed_successfully"])
    pending = [p for p in all_pdfs if p.name not in already]

    if config.demo_pdf:
        rec = parse_pdf_file(config.demo_pdf, force_ocr=force_ocr)
        rec = normalize_school(rec)
        errs = validate_record(rec)
        if errs:
            rec.errors.extend(errs)
        obj = build_json_record(rec)
        schema_errors = validate_json_record(obj)
        if schema_errors:
            print("Schema validation errors for demo PDF:")
            for e in schema_errors:
                print("-", e)
        print(dumps_pretty(obj))
        return 0

    if not pending:
        print("No pending PDFs. Manifest indicates all discovered files are processed.")
        return 0

    batch = pending[: config.batch_size]
    batch_no = int(manifest.get("last_batch", 0)) + 1
    parsed_records = []
    iterator = tqdm(batch, desc=f"Batch {batch_no}") if tqdm else batch

    batch_jsonl_path = config.output_dir / "batch.jsonl"

    for pdf in iterator:
        log = {"pdf": pdf.name, "path": str(pdf), "status": "ok", "warnings": [], "errors": []}
        try:
            rec = parse_pdf_file(pdf, force_ocr=force_ocr)
            rec = normalize_school(rec)
            errs = validate_record(rec)
            if errs:
                rec.errors.extend(errs)
            if not rec.school.udise:
                log["status"] = "skipped_missing_udise"
                log["errors"] = rec.errors + ["missing udise; row skipped"]
                mark_failure(manifest, pdf.name)
            else:
                if rec.errors:
                    rec.school.notes = _append_note(rec.school.notes, "validation issues: " + " | ".join(rec.errors))

                obj = build_json_record(rec)
                schema_errors = validate_json_record(obj)
                if schema_errors:
                    all_errs = rec.errors + schema_errors
                    log["status"] = "failed_schema"
                    log["errors"] = all_errs
                    mark_failure(manifest, pdf.name)
                else:
                    out_json = config.output_dir / f"{pdf.stem}.json"
                    out_json.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

                    parsed_records.append(rec)
                    mark_success(manifest, pdf.name)
                    log["warnings"] = rec.warnings
                    log["errors"] = rec.errors
                    log["parse_confidence"] = rec.school.parse_confidence
                    log["udise"] = rec.school.udise
        except Exception as exc:  # continue processing next PDF
            mark_failure(manifest, pdf.name)
            log["status"] = "failed"
            log["errors"] = [str(exc)]
        append_jsonl(config.log_path, log)

    unique_records = dedupe_by_udise(parsed_records)

    if unique_records:
        with batch_jsonl_path.open("a", encoding="utf-8") as f:
            for rec in unique_records:
                obj = build_json_record(rec)
                f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    manifest["last_batch"] = batch_no
    save_manifest(config.manifest_path, manifest)
    print(f"Batch {batch_no} complete.")
    print(f"Wrote per-PDF JSON files to: {config.output_dir}")
    print(f"Appended {len(unique_records)} records to JSONL: {batch_jsonl_path}")
    print(f"Processed rows: {len(unique_records)} (from {len(batch)} PDFs)")
    return 0


def _append_note(base: str, note: str) -> str:
    return f"{base}; {note}" if base else note


def main() -> int:
    args = build_parser().parse_args()
    cfg = PipelineConfig(
        input_dir=args.input_dir,
        output_dir=args.output_dir,
        manifest_path=args.manifest,
        log_path=args.log_file,
        batch_size=args.batch_size,
        recursive=not args.no_recursive,
        demo_pdf=args.demo_pdf,
    )
    return run(cfg, force_ocr=args.force_ocr)


if __name__ == "__main__":
    raise SystemExit(main())
