from __future__ import annotations

from .models import AgeRow, CategoryRow, FacilitiesRow, ParsedSchoolData, SchoolRow
from .region_map import normalize_state_name, region_for_state

UDISE_STATE_PREFIX = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "25": "Daman and Diu",
    "26": "Dadra and Nagar Haveli",
    "27": "Maharashtra",
    "28": "Andhra Pradesh",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Ladakh",
}


def fill_region(school: SchoolRow) -> None:
    school.state = normalize_state_name(school.state)
    rc, rn = region_for_state(school.state)
    school.region_code = rc
    school.region_name = rn


def normalize_school(parsed: ParsedSchoolData) -> ParsedSchoolData:
    fill_region(parsed.school)
    parsed.school.school_name = " ".join(parsed.school.school_name.split()).strip()
    parsed.school.school_name = parsed.school.school_name.replace("()", "").strip()
    if not parsed.school.state and len(parsed.school.udise) >= 2:
        parsed.school.state = UDISE_STATE_PREFIX.get(parsed.school.udise[:2], "")
        fill_region(parsed.school)
    if "REGION" in parsed.school.district.upper():
        parsed.school.district = ""
    if not parsed.school.district and "," in parsed.school.school_name:
        parts = [x.strip() for x in parsed.school.school_name.split(",") if x.strip()]
        if len(parts) >= 2:
            parsed.school.district = parts[0].split()[-1] if "VIDYALAYA" in parts[0].upper() else parts[-1]
    if not parsed.school.district and "JAWAHAR NAVODAYA VIDYALAYA" in parsed.school.school_name.upper():
        tail = parsed.school.school_name.upper().replace("JAWAHAR NAVODAYA VIDYALAYA", "").strip(" ,")
        if tail:
            parsed.school.district = tail.split(",")[0].title()
    if parsed.school.school_name and "JAWAHAR NAVODAYA VIDYALAYA" not in parsed.school.school_name.upper():
        parsed.warnings.append("school_name does not contain expected JNV heading")
    return parsed


def best_completeness_score(parsed: ParsedSchoolData) -> int:
    s = parsed.school
    score = 0
    score += 3 if s.udise else 0
    score += 2 if s.school_name else 0
    score += 1 if s.state else 0
    score += 1 if s.district else 0
    score += 2 if s.total_students is not None else 0
    score += 1 if s.total_boys is not None else 0
    score += 1 if s.total_girls is not None else 0
    score += min(4, len(parsed.social))
    score += min(4, len(parsed.age))
    score += 2 if parsed.facilities else 0
    return score


def dedupe_by_udise(records: list[ParsedSchoolData]) -> list[ParsedSchoolData]:
    best: dict[str, ParsedSchoolData] = {}
    for rec in records:
        key = rec.school.udise.strip()
        if not key:
            continue
        if key not in best:
            best[key] = rec
            continue
        if best_completeness_score(rec) > best_completeness_score(best[key]):
            rec.school.notes = _append_note(rec.school.notes, "Duplicate UDISE resolved; kept more complete record")
            best[key] = rec
        else:
            best[key].school.notes = _append_note(best[key].school.notes, "Duplicate UDISE encountered; kept existing record")
    return list(best.values())


def flatten_records(records: list[ParsedSchoolData]) -> dict[str, list[dict]]:
    schools = [r.school.as_dict() for r in records]
    social = [x.as_dict() for r in records for x in r.social]
    minority = [x.as_dict() for r in records for x in r.minority]
    others = [x.as_dict() for r in records for x in r.others]
    age = [x.as_dict() for r in records for x in r.age]
    facilities = [r.facilities.as_dict() for r in records if r.facilities is not None]
    return {
        "schools": schools,
        "enrolment_social": social,
        "enrolment_minority": minority,
        "enrolment_others": others,
        "enrolment_age": age,
        "facilities": facilities,
    }


def _append_note(base: str, note: str) -> str:
    return f"{base}; {note}" if base else note


__all__ = [
    "AgeRow",
    "CategoryRow",
    "FacilitiesRow",
    "ParsedSchoolData",
    "SchoolRow",
    "dedupe_by_udise",
    "flatten_records",
    "normalize_school",
]
