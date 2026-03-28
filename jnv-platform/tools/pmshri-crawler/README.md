# pmshri-crawler

Crawler for PM SHRI / JNV school metadata. **`src/main.js` (default `npm start`)** uses:

1. **Playwright** — only used for optional screenshots while processing each school (list build is pure ArcGIS + API).
2. **ArcGIS** — query the official `pmshree` layer with **`schmgt=93`** (all NVS / JNV schools in the PM SHRI dataset, ~611). A name-only filter misses ~60 schools (abbreviations like `J.N.V.`, typos like `NAVODYA`). India has ~660 JNVs nationally; the rest are **not in the PM SHRI layer**, so this tool cannot see or download their PM SHRI report cards.
3. **REST API** — `GET https://pmshri.education.gov.in/apipmshridashboard/api/v1/school/details/{udise}` (`src/pmshri-api.js`). UDISE codes are normalized to **11 digits** before the call.

Outputs: `data/jnv_udise_list.json`, `data/schools.json`, `data/failed_schools.json`, `data/progress.json`, and `data/screenshots/{udise}.png`.

**Report-card PDFs** are downloaded via the official API endpoint discovered in the site bundle: `GET .../school/fetchSchoolReportCard/{udise}` returns JSON whose `data` field is **base64-encoded PDF**. Run:

```bash
npm run download-pdfs
```

This writes `data/pdfs/{udise}.pdf` and updates `schools.json` (`pdf_status: "downloaded"`). Use `SKIP_EXISTING=0` to force re-download. `MAX_PDFS=N` limits how many new downloads in one run (`0` = no limit). Throttle with `BETWEEN_PDFS_MS` (default follows `BETWEEN_SCHOOLS_MS` or 1500).

If `SKIP_EXISTING=0` is set in your shell from an earlier test, **unset it** or every run will re-fetch all PDFs. For “only fill gaps”:

```bash
npm run fetch-missing-pdfs
```

Legacy modules **`extractor.js`**, **`downloader.js`**, and **`verifier.js`** target the `/state` dashboard “Know More” / report-card UI and are **not** wired into the current `main.js`.

## Layout

- `config.js` — delays, `maxSchools`, paths
- `src/crawler.js` — `resumeScraper`, `saveProgress`, district discovery helpers (legacy `/state` flow)
- `src/arcgis-discovery.js` — GIS state list + ArcGIS JNV queries
- `src/pmshri-api.js` — school details API with retries/backoff
- `src/udise.js` — `normalizeUdise` (11-digit padding)
- `src/indexer.js` — `saveSchoolRecord`, `saveFailedSchool`
- `src/main.js` — ArcGIS + API pipeline

## Setup

From the monorepo:

```bash
cd jnv-platform/tools/pmshri-crawler
npm install
npx playwright install chromium
```

## Run

```bash
npm start
```

Headed mode if needed:

```bash
set HEADLESS=false
npm start
```

### Environment variables

| Variable | Meaning |
|----------|---------|
| `REFRESH_JNV_LIST` | Set to `1` to rebuild `jnv_udise_list.json` from ArcGIS (full state loop) |
| `MAX_SCHOOLS` | Stop after N **new** API saves (`0` = unlimited) |
| `BETWEEN_SCHOOLS_MS` | Pause between schools (default 1200) |
| `API_RETRY_ATTEMPTS` | Retries per UDISE for empty API responses (default 4) |
| `API_RETRY_BASE_MS` | Base backoff between retries (default 2500) |
| `HEADLESS` | Set `false` for headed mode |

## Outputs

- `data/jnv_udise_list.json` — deduped JNV rows from ArcGIS (cached)
- `data/screenshots/{udise}.png`
- `data/schools.json` — merged records, deduped by normalized UDISE
- `data/failed_schools.json`
- `data/progress.json` — resume cursor (`arcgis_school_index`, etc.)

On Windows, if saving progress fails with `EPERM` on rename, `crawler.js` / `indexer.js` fall back to a direct write.

## Selectors

For the legacy `/state` UI, use `npx playwright codegen https://pmshri.education.gov.in/state` and adjust `extractor.js` if you re-enable that flow.
