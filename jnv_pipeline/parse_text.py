from __future__ import annotations

from pathlib import Path

import pdfplumber


def extract_pdf_text(pdf_path: Path) -> tuple[str, list[str]]:
    pages: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            pages.append(txt)
    return ("\n\n".join(pages), pages)


def text_is_weak(full_text: str) -> bool:
    # Heuristic tuned for these report cards.
    if not full_text.strip():
        return True
    line_count = len([ln for ln in full_text.splitlines() if ln.strip()])
    return line_count < 25 or "School Report Card" not in full_text
