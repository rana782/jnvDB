from __future__ import annotations

import re
from typing import Final

from .utils import clean_text, normalize_academic_year, parse_bool, parse_int


SOCIAL_ALLOWED: Final[list[str]] = ["SC", "ST", "OBC", "General", "Total"]
MINORITY_ALLOWED: Final[list[str]] = ["Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi", "Other", "Total"]
OTHERS_ALLOWED: Final[list[str]] = ["BPL", "Repeater", "CWSN", "EWS", "RTE", "Total"]
AGE_ALLOWED: Final[list[str]] = [str(x) for x in range(10, 19)] + ["Total"]


def parse_profile(full_text: str, source_pdf_name: str) -> dict[str, str | int | None]:
    lines = [clean_text(x) for x in full_text.splitlines() if clean_text(x)]
    joined = "\n".join(lines)

    school_name = ""
    m_name = re.search(r"(JAWAHAR\s+NAVODAYA\s+VIDYALAYA[^\n]*)", joined, re.I)
    if m_name:
        school_name = clean_text(m_name.group(1))
        school_name = re.sub(r"\(\*+\d{4,}\)", "", school_name).strip()

    m_file = re.search(r"(\d{11})", source_pdf_name)
    if m_file:
        udise = m_file.group(1)
    else:
        m_udise = re.search(r"\b(\d{11})\b", joined)
        udise = m_udise.group(1) if m_udise else ""

    m_year = re.search(r"Academic\s*Year\s*\(?\s*([0-9]{4}\s*[-/]\s*[0-9]{2,4})\s*\)?", joined, re.I)
    academic_year = normalize_academic_year(m_year.group(1) if m_year else "")

    state = _capture_labeled_field(lines, ["State"], stop_labels=["Educational District", "District", "School Details"])
    if "NAVODAYA" in state.upper():
        state = ""
    district = _capture_labeled_field(
        lines,
        ["District", "LGD Block", "Educational District"],
        stop_labels=["Educational Block", "Rural / Urban", "School Classification"],
    )
    return {
        "udise": udise,
        "school_name": school_name,
        "state": state,
        "district": district,
        "academic_year": academic_year,
    }


def parse_student_totals(full_text: str) -> dict[str, int | None]:
    lines = [clean_text(x) for x in full_text.splitlines() if clean_text(x)]
    joined = "\n".join(lines)
    total = boys = girls = None

    m_sum = re.search(r"Total\s*=\s*(\d+)\s*;\s*Boys\s*=\s*(\d+)\s*;\s*Girls\s*=\s*(\d+)", joined, re.I)
    if m_sum:
        return {"total_students": int(m_sum.group(1)), "total_boys": int(m_sum.group(2)), "total_girls": int(m_sum.group(3))}

    m_bg = re.search(r"Grand total B/G:\s*(\d+)\s*/\s*(\d+)", joined, re.I)
    if m_bg:
        boys, girls = int(m_bg.group(1)), int(m_bg.group(2))
        total = boys + girls

    m_total = re.search(r"\bTotal\s*Students?\s*[:\-]?\s*(\d+)\b", joined, re.I)
    if m_total:
        total = int(m_total.group(1))
    m_boys = re.search(r"\bTotal\s*Boys?\s*[:\-]?\s*(\d+)\b", joined, re.I)
    if m_boys:
        boys = int(m_boys.group(1))
    m_girls = re.search(r"\bTotal\s*Girls?\s*[:\-]?\s*(\d+)\b", joined, re.I)
    if m_girls:
        girls = int(m_girls.group(1))
    return {"total_students": total, "total_boys": boys, "total_girls": girls}


def parse_category_section(full_text: str, allowed_categories: list[str], section_hint: str) -> list[dict[str, int | str | None]]:
    rows: list[dict[str, int | str | None]] = []
    seen = set()
    lines = [clean_text(x) for x in full_text.splitlines() if clean_text(x)]
    in_section = False
    for line in lines:
        if section_hint.lower() in line.lower():
            in_section = True
            continue
        if in_section and re.search(r"enrolment\s+\(by", line, re.I):
            break
        for category in allowed_categories:
            token = category if category != "Other" else "Others?"
            if not re.search(rf"\b{token}\b", line, re.I):
                continue
            key = category.lower()
            if key in seen and category != "Total":
                continue
            nums = [int(x) for x in re.findall(r"\b\d+\b", line)]
            boys = girls = total = None
            bg = re.search(r"Total\s*B/G:\s*(\d+)\s*/\s*(\d+)", line, re.I)
            if bg:
                boys, girls = int(bg.group(1)), int(bg.group(2))
            if nums:
                if len(nums) >= 3:
                    boys, girls, total = nums[-3], nums[-2], nums[-1]
                else:
                    total = nums[-1]
            rows.append({"category": category, "boys": boys, "girls": girls, "total": total})
            seen.add(key)
            break
    return _sort_category_rows(rows, allowed_categories)


def parse_age_section(full_text: str) -> list[dict[str, int | str | None]]:
    rows: list[dict[str, int | str | None]] = []
    lines = [clean_text(x) for x in full_text.splitlines() if clean_text(x)]
    for line in lines:
        m = re.search(r"\bAge\s*(\d{1,2})\b", line, re.I)
        if m:
            age = m.group(1)
            if age not in AGE_ALLOWED:
                continue
            nums = [int(x) for x in re.findall(r"\b\d+\b", line)]
            boys = girls = total = None
            if len(nums) >= 4:
                boys, girls, total = nums[-3], nums[-2], nums[-1]
            elif nums:
                total = nums[-1]
            rows.append({"age_band": age, "boys": boys, "girls": girls, "total": total})
            continue
        if re.search(r"\bAge\b.*\bTotal\b", line, re.I) or re.match(r"Total\b", line, re.I):
            nums = [int(x) for x in re.findall(r"\b\d+\b", line)]
            if nums:
                if len(nums) >= 3:
                    rows.append({"age_band": "Total", "boys": nums[-3], "girls": nums[-2], "total": nums[-1]})
                else:
                    rows.append({"age_band": "Total", "boys": None, "girls": None, "total": nums[-1]})
    # de-duplicate by age_band keeping max total
    best: dict[str, dict[str, int | str | None]] = {}
    for row in rows:
        band = str(row["age_band"])
        if band not in best:
            best[band] = row
            continue
        prev = best[band]["total"] or -1
        cur = row["total"] or -1
        if cur > prev:
            best[band] = row
    ordered = [best[b] for b in AGE_ALLOWED if b in best]
    return ordered


def parse_facilities(full_text: str) -> dict[str, int | bool | None]:
    lines = [clean_text(x) for x in full_text.splitlines() if clean_text(x)]
    joined = "\n".join(lines)
    out: dict[str, int | bool | None] = {
        "water_available": _bool_from_label(joined, "Drinking Water Available"),
        "electricity_available": _bool_from_label(joined, "Electricity Availability"),
        "internet_available": _bool_from_label(joined, "Internet"),
        "solar_available": _bool_from_label(joined, "Solar Panel"),
        "playground_available": _bool_from_label(joined, "Playground Available"),
        "library_available": _bool_from_label(joined, "Library Availability"),
        "medical_checkups": _bool_from_label(joined, "Medical checkups"),
        "ramps_available": _bool_from_label(joined, "Availability of Ramps"),
        "functional_toilets_b": _int_from_metric(lines, "Toilets - Functional", index=1),
        "functional_toilets_g": _int_from_metric(lines, "Toilets - Functional", index=2),
        "desktops": _int_from_metric(lines, "Desktop", index=1),
        "laptops": _int_from_metric(lines, "Laptop", index=2),
        "tablets": _int_from_metric(lines, "Tablet", index=1),
        "printers": _int_from_metric(lines, "Printer", index=2),
        "smart_class_tv": _int_from_metric(lines, "DigiBoard", index=1),
        "projectors": _int_from_metric(lines, "Projector", index=1),
    }
    return out


def _capture_labeled_field(lines: list[str], labels: list[str], stop_labels: list[str]) -> str:
    for idx, line in enumerate(lines):
        for label in labels:
            if re.search(rf"\b{re.escape(label)}\b", line, re.I):
                tail = re.split(rf"{re.escape(label)}\s*[:\-]?", line, flags=re.I)[-1].strip()
                if tail and len(tail) > 2 and "NAVODAYA VIDYALAYA SAMITI" not in tail.upper():
                    return tail
                if idx + 1 < len(lines):
                    nxt = lines[idx + 1]
                    if not any(re.search(rf"\b{re.escape(st)}\b", nxt, re.I) for st in stop_labels):
                        return nxt
    return ""


def _bool_from_label(text: str, label: str) -> bool | None:
    m = re.search(rf"{re.escape(label)}\s*[:\-]?\s*([12]\s*-\s*(?:Yes|No))", text, re.I)
    return parse_bool(m.group(1) if m else None)


def _int_from_metric(lines: list[str], metric: str, index: int = 1) -> int | None:
    for line in lines:
        if re.search(rf"\b{re.escape(metric)}\b", line, re.I):
            nums = [parse_int(x) for x in re.findall(r"\b\d+\b", line)]
            nums = [n for n in nums if n is not None]
            if not nums:
                return None
            pos = min(index - 1, len(nums) - 1)
            return nums[pos]
    return None


def _sort_category_rows(rows: list[dict[str, int | str | None]], allowed: list[str]) -> list[dict[str, int | str | None]]:
    by_key: dict[str, dict[str, int | str | None]] = {}
    for row in rows:
        key = str(row["category"])
        if key not in by_key:
            by_key[key] = row
            continue
        prev = by_key[key].get("total")
        curr = row.get("total")
        if isinstance(curr, int) and (not isinstance(prev, int) or curr > prev):
            by_key[key] = row
    return [by_key[k] for k in allowed if k in by_key]
