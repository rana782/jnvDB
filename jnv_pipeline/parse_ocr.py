from __future__ import annotations

from pathlib import Path

import pytesseract
from pdf2image import convert_from_path


def ocr_pdf_text(
    pdf_path: Path,
    dpi: int = 250,
    first_page: int | None = None,
    last_page: int | None = None,
) -> tuple[str, list[str]]:
    images = convert_from_path(
        str(pdf_path),
        dpi=dpi,
        first_page=first_page,
        last_page=last_page,
    )
    pages: list[str] = []
    for image in images:
        txt = pytesseract.image_to_string(image)
        pages.append(txt)
    return ("\n\n".join(pages), pages)
