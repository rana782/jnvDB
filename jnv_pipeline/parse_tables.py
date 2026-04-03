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


def _category_grade_table_line(line: str, category: str) -> bool:
    """
    Enrolment tables use rows like 'Muslim 0 0 ... 194 93 287'. Require the label
    at line start followed by digits so we never match stray words (e.g. 'Other' in
    teacher text, 'CWSN?' headers, or 'Total Students' outside the table).
    """
    if category == "Other":
        return bool(re.match(r"^\s*(Other|Others)\s+\d", line, re.I))
    if category == "Total":
        if re.match(r"^\s*G\.Total\b", line, re.I):
            return False
        if re.search(r"\bTotal\s+(Students|Boys|Girls)\b", line, re.I):
            return False
        return bool(re.match(r"^\s*Total\s+\d", line, re.I))
    return bool(re.match(rf"^\s*{re.escape(category)}\s+\d", line, re.I))


def parse_rte_ews_standalone_rows(full_text: str) -> dict[str, dict[str, int | None]]:
    """
    RTE and EWS often appear in their own tables *above* 'Enrolment (By Others)',
    not as rows inside that block. Pull B/G/ALL from the grade table row.
    """
    lines = [clean_text(x) for x in full_text.splitlines() if clean_text(x)]
    out: dict[str, dict[str, int | None]] = {}
    for i, line in enumerate(lines):
        if re.search(r"SECTION\s+12\s+OF\s+THE\s+RTE\s+ACT|RTE\s+Act", line, re.I):
            for j in range(i + 1, min(i + 18, len(lines))):
                L = lines[j]
                if re.match(r"^\s*RTE\s+\d", L, re.I):
                    nums = [int(x) for x in re.findall(r"\b\d+\b", L)]
                    if len(nums) >= 3:
                        out["RTE"] = {"boys": nums[-3], "girls": nums[-2], "total": nums[-1]}
                    break
            break
    for i, line in enumerate(lines):
        if re.search(r"Economically\s+Weaker\s+Section", line, re.I):
            for j in range(i + 1, min(i + 18, len(lines))):
                L = lines[j]
                if re.match(r"^\s*EWS\s+\d", L, re.I):
                    nums = [int(x) for x in re.findall(r"\b\d+\b", L)]
                    if len(nums) >= 3:
                        out["EWS"] = {"boys": nums[-3], "girls": nums[-2], "total": nums[-1]}
                    break
            break
    return out


def ensure_others_total_from_rollups(
    others: list[dict[str, int | str | None]], school_totals: dict[str, int | None]
) -> list[dict[str, int | str | None]]:
    """UDISE cards often omit a Total row under Enrolment (By Others); use headline student counts."""
    if any(r.get("category") == "Total" for r in others):
        return others
    tstud = school_totals.get("total_students")
    if tstud is None:
        return others
    others.append(
        {
            "category": "Total",
            "boys": school_totals.get("total_boys"),
            "girls": school_totals.get("total_girls"),
            "total": tstud,
        }
    )
    return _sort_category_rows(others, OTHERS_ALLOWED)


def merge_rte_ews_into_others(others: list[dict[str, int | str | None]], full_text: str) -> list[dict[str, int | str | None]]:
    """Fill RTE/EWS from standalone tables when missing in Enrolment (By Others)."""
    extras = parse_rte_ews_standalone_rows(full_text)
    if not extras:
        return others
    by_cat = {str(r["category"]): r for r in others}
    for key in ("RTE", "EWS"):
        if key not in extras:
            continue
        ex = extras[key]
        if key in by_cat:
            row = by_cat[key]
            if row.get("total") is None:
                row["boys"] = ex["boys"]
                row["girls"] = ex["girls"]
                row["total"] = ex["total"]
        else:
            others.append({"category": key, "boys": ex["boys"], "girls": ex["girls"], "total": ex["total"]})
    return _sort_category_rows(others, OTHERS_ALLOWED)


def parse_category_section(full_text: str, allowed_categories: list[str], section_hint: str) -> list[dict[str, int | str | None]]:
    rows: list[dict[str, int | str | None]] = []
    seen = set()
    lines = [clean_text(x) for x in full_text.splitlines() if clean_text(x)]
    in_section = False
    for line in lines:
        if section_hint.lower() in line.lower():
            in_section = True
            continue
        if not in_section:
            continue
        if re.search(r"enrolment\s+\(by", line, re.I):
            break
        # Next block is often "Enrolment by grade ... (by Age...)" — not "(By X)"; stop before Age totals.
        if re.search(r"enrolment\s+by\s+grade", line, re.I):
            break
        if re.search(r"age[-\s]?wise\s+distribution", line, re.I):
            break
        for category in allowed_categories:
            token = category if category != "Other" else "Others?"
            if not re.search(rf"\b{token}\b", line, re.I):
                continue
            if not _category_grade_table_line(line, category):
                continue
            if category == "Total":
                if re.search(r"\bGrand\s+total\b", line, re.I):
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


def _parse_age_wise_colon_block(lines: list[str]) -> list[dict[str, int | str | None]]:
    """JNV PDFs often use 'Age-wise distribution' followed by lines like '10 : 36' (not 'Age 10')."""
    rows: list[dict[str, int | str | None]] = []
    start: int | None = None
    for i, line in enumerate(lines):
        if re.search(r"age[-\s]?wise\s+distribution", line, re.I):
            start = i + 1
            break
    if start is None:
        return rows
    for j in range(start, len(lines)):
        L = lines[j]
        if re.search(r"^(enrolment|facilities|student\s+teacher|teachers|staff|section)\b", L, re.I):
            break
        if re.match(r"^[-_=]{3,}\s*$", L):
            break
        m_bg = re.match(r"^\s*(\d{1,2})\s*:\s*(\d+)\s*/\s*(\d+)\s*$", L)
        if m_bg:
            age = m_bg.group(1)
            if age in AGE_ALLOWED:
                b, g = int(m_bg.group(2)), int(m_bg.group(3))
                rows.append({"age_band": age, "boys": b, "girls": g, "total": b + g})
            continue
        m_one = re.match(r"^\s*(\d{1,2})\s*:\s*(\d+)\s*$", L)
        if m_one:
            age = m_one.group(1)
            if age in AGE_ALLOWED:
                rows.append({"age_band": age, "boys": None, "girls": None, "total": int(m_one.group(2))})
            continue
        if re.search(r"\bAge\s*Total\b", L, re.I):
            nums = [int(x) for x in re.findall(r"\b\d+\b", L)]
            if nums:
                rows.append({"age_band": "Total", "boys": None, "girls": None, "total": nums[-1]})
    return rows


def _parse_age_by_grade_session(lines: list[str]) -> list[dict[str, int | str | None]]:
    """
    UDISE+ report cards use a wide table under:
    'Enrolment by grade ... (by Age in completed years)' with rows like:
      '10 0 0 ... 28 19 47'
    Last three numbers are Boys, Girls, Total (ALL) for that age in completed years.
    """
    rows: list[dict[str, int | str | None]] = []
    start: int | None = None
    for i, line in enumerate(lines):
        if re.search(r"by\s+Age\s+in\s+completed\s+years", line, re.I):
            start = i + 1
            break
    if start is None:
        return rows
    for j in range(start, len(lines)):
        L = lines[j]
        if re.search(r"^Disclaimer\b", L, re.I):
            break
        if re.match(r"^\s*G\.Total\b", L, re.I):
            break
        if re.match(r"^\s*Total\s+", L, re.I) and not re.match(r"^\s*G\.Total", L, re.I):
            nums = [int(x) for x in re.findall(r"\b\d+\b", L)]
            if len(nums) >= 3:
                rows.append({"age_band": "Total", "boys": nums[-3], "girls": nums[-2], "total": nums[-1]})
            break
        m = re.match(r"^\s*(\d{1,2})\s+", L)
        if not m:
            continue
        age = m.group(1)
        nums = [int(x) for x in re.findall(r"\b\d+\b", L)]
        if len(nums) < 3:
            continue
        if age not in AGE_ALLOWED:
            continue
        rows.append({"age_band": age, "boys": nums[-3], "girls": nums[-2], "total": nums[-1]})
    return rows


def _age_row_preference(a: dict[str, int | str | None], b: dict[str, int | str | None]) -> dict[str, int | str | None]:
    """Prefer rows with boys/girls populated; then higher total."""
    def score(r: dict[str, int | str | None]) -> tuple[int, int]:
        boys = r.get("boys")
        girls = r.get("girls")
        t = r.get("total")
        comp = (0 if boys is None else 1) + (0 if girls is None else 1)
        return (comp, int(t) if isinstance(t, int) else -1)

    sa, sb = score(a), score(b)
    if sb > sa:
        return b
    if sa > sb:
        return a
    ta = a.get("total")
    tb = b.get("total")
    if isinstance(tb, int) and isinstance(ta, int) and tb > ta:
        return b
    return a


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
    rows.extend(_parse_age_by_grade_session(lines))
    rows.extend(_parse_age_wise_colon_block(lines))
    # de-duplicate by age_band: prefer B/G breakdown, then higher total
    best: dict[str, dict[str, int | str | None]] = {}
    for row in rows:
        band = str(row["age_band"])
        if band not in best:
            best[band] = row
            continue
        best[band] = _age_row_preference(best[band], row)
    ordered = [best[b] for b in AGE_ALLOWED if b in best]
    return ordered


def parse_facilities(full_text: str) -> dict[str, int | bool | None]:
    lines = [clean_text(x) for x in full_text.splitlines() if clean_text(x)]
    joined = "\n".join(lines)
    out: dict[str, int | bool | None] = {
        "water_available": _bool_from_labels(joined, ["Drinking Water Available", "Drinking Water"]),
        "electricity_available": _bool_from_labels(joined, ["Electricity Availability", "Electricity Available"]),
        "internet_available": _bool_from_labels(joined, ["Internet Facility", "Internet Available", "Internet"]),
        "solar_available": _bool_from_labels(joined, ["Solar Panel", "Solar Energy", "Solar"]),
        "playground_available": _bool_from_labels(joined, ["Playground Available", "Playground"]),
        "library_available": _bool_from_labels(joined, ["Library Availability", "Library Available", "Library"]),
        "medical_checkups": _bool_from_labels(joined, ["Medical checkups", "Medical Checkups", "Medical Check-up"]),
        "ramps_available": _bool_from_labels(joined, ["Availability of Ramps", "Ramps Available", "Ramps"]),
        "functional_toilets_b": _int_from_metric_any(lines, ["Toilets - Functional", "Functional Toilets"], index=1),
        "functional_toilets_g": _int_from_metric_any(lines, ["Toilets - Functional", "Functional Toilets"], index=2),
        "desktops": _int_from_metric_any(lines, ["Desktop", "Desktops"], index=1),
        "laptops": _int_from_metric_any(lines, ["Laptop", "Laptops"], index=2),
        "tablets": _int_from_metric_any(lines, ["Tablet", "Tablets"], index=1),
        "printers": _int_from_metric_any(lines, ["Printer", "Printers"], index=2),
        "smart_class_tv": _int_from_metric_any(lines, ["Smart Class TV", "DigiBoard", "Smart Class"], index=1),
        "projectors": _int_from_metric_any(lines, ["Projector", "Projectors"], index=1),
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
    if m:
        return parse_bool(m.group(1))
    m2 = re.search(rf"{re.escape(label)}\s*[:\-]?\s*(Yes|No)\b", text, re.I)
    if m2:
        return m2.group(1).lower() == "yes"
    return None


def _bool_from_labels(text: str, labels: list[str]) -> bool | None:
    for label in labels:
        b = _bool_from_label(text, label)
        if b is not None:
            return b
    return None


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


def _int_from_metric_any(lines: list[str], metrics: list[str], index: int = 1) -> int | None:
    for metric in metrics:
        v = _int_from_metric(lines, metric, index)
        if v is not None:
            return v
    return None


def _category_row_merge_preference(
    prev: dict[str, int | str | None], new: dict[str, int | str | None]
) -> dict[str, int | str | None]:
    """Prefer rows with more B/G/total filled; on tie prefer *later* row (correct section over stray)."""

    def score(r: dict[str, int | str | None]) -> tuple[int, int]:
        comp = sum(1 for k in ("boys", "girls", "total") if r.get(k) is not None)
        t = r.get("total")
        return (comp, int(t) if isinstance(t, int) else -1)

    sp, sn = score(prev), score(new)
    if sn > sp:
        return new
    if sp > sn:
        return prev
    return new


def _sort_category_rows(rows: list[dict[str, int | str | None]], allowed: list[str]) -> list[dict[str, int | str | None]]:
    by_key: dict[str, dict[str, int | str | None]] = {}
    for row in rows:
        key = str(row["category"])
        if key not in by_key:
            by_key[key] = row
            continue
        by_key[key] = _category_row_merge_preference(by_key[key], row)
    return [by_key[k] for k in allowed if k in by_key]

def parse_teachers_section(full_text: str) -> list[dict[str, str | int]]:
    rows: list[dict[str, str | int]] = []
    lines = [clean_text(x) for x in full_text.splitlines() if clean_text(x)]
    joined = "\n".join(lines)
    
    # 1. Gender Breakdowns
    m_male = re.search(r"\bMale\s*(\d+)", joined, re.I)
    if m_male:
        rows.append({"category": "Gender", "label": "Male", "count": int(m_male.group(1))})
    m_female = re.search(r"\bFemale\s*(\d+)", joined, re.I)
    if m_female:
        rows.append({"category": "Gender", "label": "Female", "count": int(m_female.group(1))})
        
    # 2. Nature of Appointment
    m_reg = re.search(r"\bRegular\s*(\d+)", joined, re.I)
    if m_reg:
         rows.append({"category": "Nature of Appointment", "label": "Regular", "count": int(m_reg.group(1))})
    m_part = re.search(r"\bPart-time\s*(\d+)", joined, re.I)
    if m_part:
         rows.append({"category": "Nature of Appointment", "label": "Part-time", "count": int(m_part.group(1))})
    m_contract = re.search(r"\bContract\s*(\d+)", joined, re.I)
    if m_contract:
         rows.append({"category": "Nature of Appointment", "label": "Contract", "count": int(m_contract.group(1))})
         
    # 3. Academic Qualification
    m_bg = re.search(r"Below Graduate\s*(\d+)", joined, re.I)
    if m_bg:
         rows.append({"category": "Academic Qualification", "label": "Below Graduate", "count": int(m_bg.group(1))})
    m_g = re.search(r"\bGraduate\s*(\d+)", joined, re.I)
    if m_g:
         rows.append({"category": "Academic Qualification", "label": "Graduate", "count": int(m_g.group(1))})
    m_pg = re.search(r"Post Graduate(?: and Above)?\s*(\d+)", joined, re.I)
    if m_pg:
         rows.append({"category": "Academic Qualification", "label": "Post Graduate", "count": int(m_pg.group(1))})
         
    # 4. Professional Qualification
    m_bed = re.search(r"B\.Ed\. or Equivalent\s*(\d+)", joined, re.I)
    if m_bed:
         rows.append({"category": "Professional Qualification", "label": "B.Ed. or Equivalent", "count": int(m_bed.group(1))})
    m_none = re.search(r"\bNone\s*(\d+)", joined, re.I)
    if m_none:
         rows.append({"category": "Professional Qualification", "label": "None", "count": int(m_none.group(1))})
         
    return rows
