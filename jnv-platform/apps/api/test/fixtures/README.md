# Test fixtures

`report-card-sample.pdf` is a small PDF (pdfkit) with embedded text in a PM SHRI–style layout (social category block). Regenerate with:

```bash
npm run fixture:pdf -w @jnv/api
```

Golden counts: **SC 120, ST 45, OBC 200, General 80, Total 445** (sum matches total).

`extractPdfText` tries **pdf-parse** first, then **pdf.js** (`pdfjs-dist`) if pdf-parse fails—so this fixture stays readable in CI across Node/pdf-parse quirks.

Integration tests cover: PDF → parser → `executePdfImportJob` → `SchoolEnrolmentSocial` rows → `GET /api/schools/:udise` shape.
