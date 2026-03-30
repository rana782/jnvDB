from __future__ import annotations

from pathlib import Path

from .models import AgeRow, CategoryRow, FacilitiesRow, ParsedSchoolData, SchoolRow
from .parse_ocr import ocr_pdf_text
from .parse_tables import (
    AGE_ALLOWED,
    MINORITY_ALLOWED,
    OTHERS_ALLOWED,
    SOCIAL_ALLOWED,
    parse_age_section,
    parse_category_section,
    parse_facilities,
    parse_profile,
    parse_student_totals,
)
from .parse_text import extract_pdf_text, text_is_weak
from .utils import score_ratio


def parse_pdf_file(pdf_path: Path, force_ocr: bool = False) -> ParsedSchoolData:
    text, _ = extract_pdf_text(pdf_path)
    used_ocr = False
    ocr_note = ""
    if force_ocr or text_is_weak(text):
        try:
            ocr_text, _ = ocr_pdf_text(pdf_path)
            if len(ocr_text) > len(text) * 0.65:
                text = ocr_text
                used_ocr = True
        except Exception as exc:
            ocr_note = f"OCR unavailable/failed: {exc}"

    profile = parse_profile(text, pdf_path.name)
    totals = parse_student_totals(text)
    social = parse_category_section(text, SOCIAL_ALLOWED, "Enrolment (By Social Category)")
    minority = parse_category_section(text, MINORITY_ALLOWED, "Enrolment (By Minority)")
    others = parse_category_section(text, OTHERS_ALLOWED, "Enrolment (By Others)")
    age = parse_age_section(text)
    facilities = parse_facilities(text)

    school = SchoolRow(
        udise=str(profile.get("udise") or ""),
        school_name=str(profile.get("school_name") or ""),
        state=str(profile.get("state") or ""),
        district=str(profile.get("district") or ""),
        academic_year=str(profile.get("academic_year") or ""),
        total_students=totals.get("total_students"),
        total_boys=totals.get("total_boys"),
        total_girls=totals.get("total_girls"),
        source_pdf_name=pdf_path.name,
        parse_confidence=0.0,
        notes="",
    )
    if not school.school_name and school.udise:
        school.school_name = f"JAWAHAR NAVODAYA VIDYALAYA {school.udise}"
    if used_ocr:
        school.notes = _append_note(school.notes, "OCR fallback used")
    if ocr_note:
        school.notes = _append_note(school.notes, ocr_note)
    if not school.udise:
        school.notes = _append_note(school.notes, "UDISE not found in text; filename fallback failed")

    # Prefer explicit totals from sections
    social_total = next((r["total"] for r in social if r["category"] == "Total"), None)
    age_total = next((r["total"] for r in age if r["age_band"] == "Total"), None)
    if social_total is not None:
        school.total_students = social_total
    elif age_total is not None and school.total_students is None:
        school.total_students = age_total

    if school.total_boys is None or school.total_girls is None:
        social_row_total = next((r for r in social if r["category"] == "Total"), None)
        if social_row_total:
            if school.total_boys is None:
                school.total_boys = social_row_total.get("boys") if isinstance(social_row_total.get("boys"), int) else None
            if school.total_girls is None:
                school.total_girls = social_row_total.get("girls") if isinstance(social_row_total.get("girls"), int) else None

    parsed = ParsedSchoolData(
        school=school,
        social=[CategoryRow(udise=school.udise, **r) for r in social],
        minority=[CategoryRow(udise=school.udise, **r) for r in minority],
        others=[CategoryRow(udise=school.udise, **r) for r in others],
        age=[AgeRow(udise=school.udise, **r) for r in age if str(r.get("age_band")) in AGE_ALLOWED],
        facilities=FacilitiesRow(udise=school.udise, **facilities),
    )
    parsed.school.parse_confidence = _compute_confidence(parsed)
    return parsed


def _compute_confidence(parsed: ParsedSchoolData) -> float:
    checks = [
        bool(parsed.school.udise),
        bool(parsed.school.school_name),
        bool(parsed.school.state),
        bool(parsed.school.district),
        parsed.school.total_students is not None,
        len(parsed.social) > 0,
        len(parsed.minority) > 0,
        len(parsed.others) > 0,
        len(parsed.age) > 0,
        parsed.facilities is not None,
    ]
    return score_ratio(sum(1 for x in checks if x), len(checks))


def _append_note(base: str, note: str) -> str:
    return f"{base}; {note}" if base else note
