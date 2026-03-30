# JNV PDF to Excel ETL Pipeline

Local production-style ETL for JNV report-card PDFs.  
Parses text PDFs first, falls back to OCR for weak scans, validates rows, deduplicates by UDISE, and writes import-ready Excel batches.

## Output Workbooks

- `JNV_bulk_import_ready_batch_01.xlsx`
- `JNV_bulk_import_ready_batch_02.xlsx`
- ...

Each workbook contains exactly 6 sheets:
- `schools`
- `enrolment_social`
- `enrolment_minority`
- `enrolment_others`
- `enrolment_age`
- `facilities`

## Install

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r jnv_pipeline/requirements.txt
```

### One-click Windows setup

From workspace root:

```bash
jnv_pipeline\setup_and_install.bat
```

### Install Tesseract

- Windows: install Tesseract OCR and add installation folder to `PATH`.
- Verify:

```bash
tesseract --version
```

### Install Poppler (for pdf2image)

- Windows: install Poppler binaries and add `bin` folder to `PATH`.
- Verify:

```bash
pdftoppm -h
```

## Run Batch Processing

```bash
python -m jnv_pipeline.main ^
  --input-dir "C:\path\to\pdfs" ^
  --output-dir "C:\path\to\outputs" ^
  --manifest "C:\path\to\state\manifest.json" ^
  --log-file "C:\path\to\state\processing_log.jsonl" ^
  --batch-size 50
```

### One-click Windows run

1. Edit `jnv_pipeline\run_pipeline.bat` and set:
   - `INPUT_DIR`
   - `OUTPUT_DIR`
   - `STATE_DIR`
2. Run:

```bash
jnv_pipeline\run_pipeline.bat
```

## Resume Next Batch

Run the same command again.  
Processed files are skipped via manifest.

## Demo Mode (single PDF)

```bash
python -m jnv_pipeline.main ^
  --input-dir "C:\path\to\pdfs" ^
  --output-dir "C:\path\to\outputs" ^
  --demo-pdf "C:\path\to\pdfs\01111201324.pdf"
```

## Useful Options

- Force OCR for all files:

```bash
python -m jnv_pipeline.main ... --force-ocr
```

- Disable recursive discovery:

```bash
python -m jnv_pipeline.main ... --no-recursive
```

## Logs and Manifest

- Manifest JSON:
  - `processed_successfully`: PDF filenames completed
  - `failed`: PDF filenames that failed
  - `last_batch`: last written batch number
- JSONL processing log:
  - one line per PDF with parse status, warnings, errors, confidence, and UDISE when found

## Notes

- Parser is tuned for JNV report-card layouts.
- If a PDF is unreadable, pipeline logs failure and continues.
- Workbook headers are validated before save.
