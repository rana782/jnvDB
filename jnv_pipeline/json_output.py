from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from .models import ParsedSchoolData


SOCIAL_CATEGORIES = ["SC", "ST", "OBC", "General", "Total"]
MINORITY_CATEGORIES = ["Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi", "Other", "Total"]
OTHERS_CATEGORIES = ["BPL", "Repeater", "CWSN", "EWS", "RTE", "Total"]
AGE_BANDS = ["10", "11", "12", "13", "14", "15", "16", "17", "18", "Total"]


def _norm_key(v: Optional[str]) -> str:
    return (v or "").strip().lower()


def _category_index(rows, attr: str = "category") -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for r in rows:
        key = _norm_key(getattr(r, attr, None))
        if key:
            out[key] = r
    return out


def _pick_cat_row(udise: str, label: str, idx: Dict[str, Any], aliases: List[str]) -> Dict[str, Any]:
    for a in aliases:
        r = idx.get(_norm_key(a))
        if r is not None:
            return {
                "udise": udise,
                "category": label,
                "boys": getattr(r, "boys", None),
                "girls": getattr(r, "girls", None),
                "total": getattr(r, "total", None),
            }
    return {"udise": udise, "category": label, "boys": None, "girls": None, "total": None}


def _pick_age_row(udise: str, band: str, idx: Dict[str, Any]) -> Dict[str, Any]:
    r = idx.get(_norm_key(band))
    if r is not None:
        return {
            "udise": udise,
            "age_band": band,
            "boys": getattr(r, "boys", None),
            "girls": getattr(r, "girls", None),
            "total": getattr(r, "total", None),
        }
    return {"udise": udise, "age_band": band, "boys": None, "girls": None, "total": None}


def build_json_record(rec: ParsedSchoolData) -> Dict[str, Any]:
    """
    Map ParsedSchoolData (one PDF) into the target JSON schema.
    Missing values remain null; category lists are padded to the fixed schema.
    """
    u = rec.school.udise or ""

    schools = {
        "udise": u,
        "school_name": rec.school.school_name or "",
        "state": rec.school.state or "",
        "district": rec.school.district or "",
        "academic_year": rec.school.academic_year or "",
        "total_students": rec.school.total_students,
        "total_boys": rec.school.total_boys,
        "total_girls": rec.school.total_girls,
        "source_pdf_name": rec.school.source_pdf_name,
        "parse_confidence": float(rec.school.parse_confidence or 0.0),
    }

    social_idx = _category_index(rec.social)
    social_rows: List[Dict[str, Any]] = []
    social_rows.append(_pick_cat_row(u, "SC", social_idx, ["sc", "scheduled caste (sc)", "scheduled caste"]))
    social_rows.append(_pick_cat_row(u, "ST", social_idx, ["st", "scheduled tribe (st)", "scheduled tribe"]))
    social_rows.append(_pick_cat_row(u, "OBC", social_idx, ["obc", "other backward classes", "o.b.c."]))
    social_rows.append(_pick_cat_row(u, "General", social_idx, ["general"]))
    social_rows.append(_pick_cat_row(u, "Total", social_idx, ["total"]))

    minority_idx = _category_index(rec.minority)
    minority_rows: List[Dict[str, Any]] = []
    minority_rows.append(_pick_cat_row(u, "Muslim", minority_idx, ["muslim"]))
    minority_rows.append(_pick_cat_row(u, "Christian", minority_idx, ["christian"]))
    minority_rows.append(_pick_cat_row(u, "Sikh", minority_idx, ["sikh"]))
    minority_rows.append(_pick_cat_row(u, "Buddhist", minority_idx, ["buddhist"]))
    minority_rows.append(_pick_cat_row(u, "Jain", minority_idx, ["jain"]))
    # Parsi rarely appears in JNV cards; keep slot with nulls when absent.
    minority_rows.append(_pick_cat_row(u, "Parsi", minority_idx, ["parsi"]))
    minority_rows.append(_pick_cat_row(u, "Other", minority_idx, ["other", "others"]))
    minority_rows.append(_pick_cat_row(u, "Total", minority_idx, ["total"]))

    others_idx = _category_index(rec.others)
    others_rows: List[Dict[str, Any]] = []
    others_rows.append(_pick_cat_row(u, "BPL", others_idx, ["bpl"]))
    others_rows.append(_pick_cat_row(u, "Repeater", others_idx, ["repeater"]))
    others_rows.append(_pick_cat_row(u, "CWSN", others_idx, ["cwsn"]))
    others_rows.append(_pick_cat_row(u, "EWS", others_idx, ["ews"]))
    # RTE is rarely explicit; keep slot even when missing.
    others_rows.append(_pick_cat_row(u, "RTE", others_idx, ["rte"]))
    others_rows.append(_pick_cat_row(u, "Total", others_idx, ["total"]))

    age_idx = {(_norm_key(r.age_band)): r for r in rec.age}
    age_rows: List[Dict[str, Any]] = []
    for band in AGE_BANDS:
        age_rows.append(_pick_age_row(u, band, age_idx))

    if rec.facilities is not None:
        fac = asdict(rec.facilities)
    else:
        fac = {
            "udise": u,
            "water_available": None,
            "electricity_available": None,
            "internet_available": None,
            "solar_available": None,
            "playground_available": None,
            "library_available": None,
            "functional_toilets_b": None,
            "functional_toilets_g": None,
            "desktops": None,
            "laptops": None,
            "tablets": None,
            "printers": None,
            "smart_class_tv": None,
            "projectors": None,
            "medical_checkups": None,
            "ramps_available": None,
        }

    notes: List[str] = []
    if rec.school.notes:
        for part in str(rec.school.notes).split(";"):
            part = part.strip()
            if part:
                notes.append(part)

    source = {
        "pdf_name": rec.school.source_pdf_name,
        "page_count": None,
        "parse_confidence": float(rec.school.parse_confidence or 0.0),
        "notes": notes,
    }

    return {
        "schools": schools,
        "enrolment_social": social_rows,
        "enrolment_minority": minority_rows,
        "enrolment_others": others_rows,
        "enrolment_age": age_rows,
        "facilities": {
            "udise": fac.get("udise", u),
            "water_available": fac.get("water_available"),
            "electricity_available": fac.get("electricity_available"),
            "internet_available": fac.get("internet_available"),
            "solar_available": fac.get("solar_available"),
            "playground_available": fac.get("playground_available"),
            "library_available": fac.get("library_available"),
            "functional_toilets_b": fac.get("functional_toilets_b"),
            "functional_toilets_g": fac.get("functional_toilets_g"),
            "desktops": fac.get("desktops"),
            "laptops": fac.get("laptops"),
            "tablets": fac.get("tablets"),
            "printers": fac.get("printers"),
            "smart_class_tv": fac.get("smart_class_tv"),
            "projectors": fac.get("projectors"),
        },
        "source": source,
    }


def validate_json_record(obj: Dict[str, Any]) -> List[str]:
    """
    Lightweight schema validation for the target JSON shape.
    Returns a list of human-readable error strings (empty when OK).
    """
    errors: List[str] = []

    schools = obj.get("schools") or {}
    udise = str(schools.get("udise") or "")
    if udise and (len(udise) != 11 or not udise.isdigit()):
        errors.append("schools.udise must be 11 digits when present")

    required_school_keys = [
        "udise",
        "school_name",
        "state",
        "district",
        "academic_year",
        "total_students",
        "total_boys",
        "total_girls",
        "source_pdf_name",
        "parse_confidence",
    ]
    for k in required_school_keys:
        if k not in schools:
            errors.append(f"schools.{k} missing")

    def _check_categories(key: str, expected: List[str]) -> None:
        arr = obj.get(key)
        if not isinstance(arr, list):
            errors.append(f"{key} must be a list")
            return
        seen = {_norm_key(r.get("category")) for r in arr if isinstance(r, dict) and "category" in r}
        for label in expected:
            if _norm_key(label) not in seen:
                errors.append(f"{key} missing category '{label}'")

    _check_categories("enrolment_social", SOCIAL_CATEGORIES)
    _check_categories("enrolment_minority", MINORITY_CATEGORIES)
    _check_categories("enrolment_others", OTHERS_CATEGORIES)

    age_arr = obj.get("enrolment_age")
    if not isinstance(age_arr, list):
        errors.append("enrolment_age must be a list")
    else:
        bands = {_norm_key(r.get("age_band")) for r in age_arr if isinstance(r, dict)}
        for band in AGE_BANDS:
            if _norm_key(band) not in bands:
                errors.append(f"enrolment_age missing age_band '{band}'")

    fac = obj.get("facilities") or {}
    if not isinstance(fac, dict):
        errors.append("facilities must be an object")
    else:
        for bkey in [
            "water_available",
            "electricity_available",
            "internet_available",
            "solar_available",
            "playground_available",
            "library_available",
        ]:
            v = fac.get(bkey)
            if v is not None and not isinstance(v, bool):
                errors.append(f"facilities.{bkey} must be boolean or null")

    # Coherence checks: social total vs sum of buckets (do not change values, only log).
    try:
        social_rows = obj.get("enrolment_social") or []
        by_cat = {_norm_key(r.get("category")): r for r in social_rows if isinstance(r, dict)}
        total_row = by_cat.get("total")
        if total_row is not None:
            explicit = total_row.get("total")
            parts = 0
            for label in ["sc", "st", "obc", "general"]:
                r = by_cat.get(label)
                if isinstance(r, dict) and isinstance(r.get("total"), int):
                    parts += int(r["total"])
            if isinstance(explicit, int) and parts and parts != explicit:
                errors.append("social total mismatch: explicit Total != sum of SC/ST/OBC/General")
    except Exception:
        # Do not halt on consistency check failures.
        pass

    return errors


def dumps_pretty(obj: Dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=False)

