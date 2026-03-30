from __future__ import annotations

import re
from typing import Iterable

from .models import ParsedSchoolData


SOCIAL = {"SC", "ST", "OBC", "General", "Total"}
MINORITY = {"Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi", "Other", "Total"}
OTHERS = {"BPL", "Repeater", "CWSN", "EWS", "RTE", "Total"}
AGE = {str(i) for i in range(10, 19)} | {"Total"}


def validate_record(rec: ParsedSchoolData) -> list[str]:
    errors: list[str] = []
    s = rec.school
    if not re.fullmatch(r"\d{11}", s.udise or ""):
        errors.append("invalid or missing udise")
    if not s.school_name:
        errors.append("missing school_name")
    if s.state and "samiti" in s.state.lower():
        errors.append("state appears to be organization label")
    if s.district and "region" in s.district.lower():
        errors.append("district appears to be region label")
    _validate_categories(rec.social, SOCIAL, "enrolment_social", errors)
    _validate_categories(rec.minority, MINORITY, "enrolment_minority", errors)
    _validate_categories(rec.others, OTHERS, "enrolment_others", errors)
    _validate_age(rec, errors)
    _validate_totals(rec, errors)
    return errors


def validate_sheet_headers(sheets: dict[str, list[dict]], expected: dict[str, list[str]]) -> list[str]:
    errs: list[str] = []
    for sheet, headers in expected.items():
        rows = sheets.get(sheet, [])
        if not rows:
            continue
        sample = list(rows[0].keys())
        if sample != headers:
            errs.append(f"{sheet}: header order mismatch")
    return errs


def _validate_categories(rows: Iterable, allowed: set[str], name: str, out: list[str]) -> None:
    for row in rows:
        if row.category not in allowed:
            out.append(f"{name}: invalid category '{row.category}'")


def _validate_age(rec: ParsedSchoolData, out: list[str]) -> None:
    for row in rec.age:
        if row.age_band not in AGE:
            out.append(f"enrolment_age: invalid age_band '{row.age_band}'")


def _validate_totals(rec: ParsedSchoolData, out: list[str]) -> None:
    s = rec.school
    if s.total_boys is not None and s.total_girls is not None and s.total_students is not None:
        if s.total_students != s.total_boys + s.total_girls:
            out.append("schools totals mismatch: total_students != boys+girls")
    social_total = next((r.total for r in rec.social if r.category == "Total"), None)
    if social_total is not None and s.total_students is not None and social_total != s.total_students:
        out.append("social total != schools total_students")
    age_total = next((r.total for r in rec.age if r.age_band == "Total"), None)
    if age_total is not None and s.total_students is not None and age_total != s.total_students:
        out.append("age total != schools total_students")
