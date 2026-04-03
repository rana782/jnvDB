# JNV PDF to Excel ETL Pipeline

Local production-style ETL for JNV report-card PDFs.  
Parses text PDFs first, falls back to OCR for weak scans, validates rows, deduplicates by UDISE, and writes import-ready Excel batches.

## Output Workbooks

- `JNV_bulk_import_ready_batch_01.xlsx`
- `JNV_bulk_import_ready_batch_02.xlsx`
- ...

### Master workbook from crawler JSON (no PDFs required)

If `jnv-platform/tools/pmshri-crawler/data/extractions/*.json` already exists (same schema as the API snapshot) but you have no PDFs under `pdfs/`, build the single import file:

```bash
# from repo root (learn_git)
python -m jnv_pipeline.build_master_from_extractions
```

Writes `jnv_pipeline/output/JNV_bulk_import_ready_MASTER.xlsx`. From `jnv-platform`: `npm run data:build-master`, or full local refresh: `npm run data:refresh-local` (build master + import SQLite + reconcile).

### Batch PDF pipeline output

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

## Load static JSON into PostgreSQL (production) — no PDF API import

Use this as the primary production flow:

`jnv_pipeline/output/json_full/*.json` (or `batch.jsonl`) -> `import_json_to_postgres.py` -> PostgreSQL -> API -> frontend.

### One-time JSON seed (recommended)

1. Set `DATABASE_URL` to your PostgreSQL connection string.
2. Run (from repo root):

```bash
python -m jnv_pipeline.import_json_to_postgres --input-dir jnv_pipeline/output/json_full
```

Useful options:

```bash
# single record file
python -m jnv_pipeline.import_json_to_postgres --input-file jnv_pipeline/output/json_full/01010802004.json

# JSONL input
python -m jnv_pipeline.import_json_to_postgres --input-jsonl jnv_pipeline/output/json_full/batch.jsonl

# validation-only dry run (no DB writes)
python -m jnv_pipeline.import_json_to_postgres --input-dir jnv_pipeline/output/json_full --validate-only
```

The ingester is idempotent (`School.udise` upsert), logs per source, keeps a resume manifest, validates categories/age bands/types, and continues on per-file failures.

## Load bulk Excel into PostgreSQL (legacy compatibility)

Use when **`JNV_bulk_import_ready_MASTER.xlsx`** is the source of truth (not `npm run import:run`).

1. `pip install -r jnv_pipeline/requirements.txt` (includes `psycopg2-binary`).
2. Place the master workbook at `jnv_pipeline/output/JNV_bulk_import_ready_MASTER.xlsx` (this file can be committed; do **not** commit `dev.db` or Postgres dumps).
3. Set `DATABASE_URL` to your PostgreSQL connection string (Render **External** URL).
4. Run: `py jnv_pipeline/import_master_to_postgres.py` (optional: `--xlsx "C:\path\to\MASTER.xlsx"`).

Then refresh map/dashboard derivations against the same DB: temporarily set `provider = "postgresql"` in `apps/api/prisma/schema.prisma`, run `npx prisma generate` in `apps/api`, set `DATABASE_URL`, then `npx tsx scripts/dev-reconcile-dashboard-data.ts`.

**Optional — run import from GitHub:** add repo secret `PRODUCTION_DATABASE_URL`, commit the master workbook, then **Actions → Import bulk Excel to Postgres → Run workflow**, input `IMPORT` in the confirm field. This runs `import_master_to_postgres.py` on the runner (you still need to run reconcile locally or in a follow-up job if you want KPI rollups updated).

### End-to-end offline workflow (one academic year, no live PDF extraction)

1. **States / auth** — `npx prisma migrate deploy` (or `db push`), then `npx prisma db seed` in `jnv-platform/apps/api` so `State` rows exist.
2. **Excel** — keep `JNV_bulk_import_ready_MASTER.xlsx` under `jnv_pipeline/output/` with the six sheets; optional column on `schools`: `pdf_relative_path` (or `pdfRelativePath`) = path relative to repo, e.g. `jnv-platform/tools/pmshri-crawler/data/pdfs/01111201324.pdf`.
3. **Load DB** — `set DATABASE_URL=postgresql://...` then `py jnv_pipeline/import_master_to_postgres.py`.
4. **PDF files (view only)** — place PDFs where those paths point, and set **`JNV_DATA_ROOT`** in `apps/api/.env` to the **parent of `jnv-platform/`** (e.g. your `learn_git` folder) so `GET /api/schools/:udise/pdf` can open the file. If the workbook has no PDF column, run `py jnv_pipeline/backfill_pdf_paths.py` (same `DATABASE_URL`; override path pattern with `JNV_PDF_REL_TEMPLATE` if needed).
5. **Dashboard / map rollups** — from `apps/api` with Postgres provider + `DATABASE_URL`: `npx tsx scripts/dev-reconcile-dashboard-data.ts`.
6. **Lock the API** — set **`JNV_DISABLE_PDF_IMPORT=true`** so nobody triggers server-side PDF extraction via `POST /api/import/run` (UI already uses Excel-loaded data only).

The Python PDF→Excel batch job in this folder is **optional**: use it only when you need to *produce* new workbooks from scans; the running product only needs the master Excel + optional PDF files on disk for the school detail viewer.
