"""
Build JNV_bulk_import_ready_MASTER.xlsx from API/crawler extraction JSON files.

Usage (from repo root):
  python -m jnv_pipeline.build_master_from_extractions
  python -m jnv_pipeline.build_master_from_extractions --extractions "C:\\path\\to\\extractions"

Then: npm run data:import-sqlite   (from jnv-platform)
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from .excel_writer import SHEET_HEADERS, write_workbook
from .models import AgeRow, CategoryRow, FacilitiesRow, ParsedSchoolData, SchoolRow, TeacherRow
from .normalize import UDISE_STATE_PREFIX, dedupe_by_udise, fill_region, flatten_records
from .validate import validate_sheet_headers
from .parse_text import extract_pdf_text
from .parse_tables import parse_teachers_section


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _as_int(v: object) -> int | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        if v != v:  # NaN
            return None
        return int(v)
    return None


def _mean_confidence(cb: object) -> float | None:
    if not isinstance(cb, dict):
        return None
    nums = [float(x) for x in cb.values() if isinstance(x, (int, float))]
    if not nums:
        return None
    return float(statistics.mean(nums))


def _social_rows(udise: str, block: object) -> list[CategoryRow]:
    if not isinstance(block, dict):
        return []
    mapping = [
        ("sc", "SC"),
        ("st", "ST"),
        ("obc", "OBC"),
        ("general", "General"),
        ("total", "Total"),
    ]
    out: list[CategoryRow] = []
    for key, label in mapping:
        t = _as_int(block.get(key))
        if t is not None:
            out.append(CategoryRow(udise=udise, category=label, boys=None, girls=None, total=t))
    return out


def _minority_rows(udise: str, block: object) -> list[CategoryRow]:
    if not isinstance(block, dict):
        return []
    mapping = [
        ("muslim", "Muslim"),
        ("christian", "Christian"),
        ("sikh", "Sikh"),
        ("buddhist", "Buddhist"),
        ("jain", "Jain"),
        ("others", "Other"),
        ("total", "Total"),
    ]
    out: list[CategoryRow] = []
    for key, label in mapping:
        t = _as_int(block.get(key))
        if t is not None:
            out.append(CategoryRow(udise=udise, category=label, boys=None, girls=None, total=t))
    return out


def _others_rows(udise: str, block: object) -> list[CategoryRow]:
    if not isinstance(block, dict):
        return []
    mapping = [
        ("cwsn", "CWSN"),
        ("ews", "EWS"),
        ("bpl", "BPL"),
        ("repeater", "Repeater"),
        ("otherCategories", "Other categories"),
        ("total", "Total"),
    ]
    out: list[CategoryRow] = []
    for key, label in mapping:
        t = _as_int(block.get(key))
        if t is not None:
            out.append(CategoryRow(udise=udise, category=label, boys=None, girls=None, total=t))
    return out


def _age_rows(udise: str, block: object) -> list[AgeRow]:
    if not isinstance(block, dict):
        return []
    out: list[AgeRow] = []
    t_tot = _as_int(block.get("total"))
    if t_tot is not None:
        out.append(AgeRow(udise=udise, age_band="Total", boys=None, girls=None, total=t_tot))
    for k, v in block.items():
        if not k.startswith("age_"):
            continue
        suffix = k.replace("age_", "", 1)
        band = suffix
        t = _as_int(v)
        if t is not None:
            out.append(AgeRow(udise=udise, age_band=band, boys=None, girls=None, total=t))
    return out


def _facilities(udise: str, structured: dict) -> FacilitiesRow | None:
    infra = structured.get("infra") if isinstance(structured.get("infra"), dict) else {}
    digital = structured.get("digital") if isinstance(structured.get("digital"), dict) else {}

    def b(key: str) -> bool | None:
        v = infra.get(key)
        if v is True:
            return True
        if v is False:
            return False
        return None

    row = FacilitiesRow(
        udise=udise,
        water_available=b("water"),
        electricity_available=b("electricity"),
        internet_available=b("internet"),
        solar_available=b("solar"),
        playground_available=b("playground"),
        library_available=b("library"),
        functional_toilets_b=None,
        functional_toilets_g=None,
        desktops=_as_int(digital.get("desktops")),
        laptops=_as_int(digital.get("laptops")),
        tablets=_as_int(digital.get("tablets")),
        printers=_as_int(digital.get("printers")),
        smart_class_tv=_as_int(digital.get("smartClassTv")),
        projectors=_as_int(digital.get("projectors")),
        medical_checkups=None,
        ramps_available=None,
    )
    d = row.as_dict()
    if all(v is None for k, v in d.items() if k != "udise"):
        return None
    return row


def parsed_from_extraction_obj(data: dict, source_file: str) -> ParsedSchoolData | None:
    st = data.get("structured")
    if not isinstance(st, dict):
        return None
    udise_raw = st.get("udise")
    udise = str(udise_raw).strip().replace(".0", "") if udise_raw is not None else ""
    if len(udise) == 11 and udise.isdigit():
        pass
    else:
        stem = Path(source_file).stem
        if len(stem) == 11 and stem.isdigit():
            udise = stem
        else:
            return None

    prov = data.get("provenance") if isinstance(data.get("provenance"), dict) else {}
    students = st.get("students") if isinstance(st.get("students"), dict) else {}

    total_students = _as_int(students.get("total"))
    total_boys = _as_int(students.get("boys"))
    total_girls = _as_int(students.get("girls"))
    if (
        total_students is not None
        and total_students > 0
        and total_boys == 0
        and total_girls == 0
    ):
        total_boys = None
        total_girls = None
    elif (
        total_students is not None
        and total_boys is not None
        and total_girls is not None
        and total_boys + total_girls != total_students
    ):
        total_boys = None
        total_girls = None

    prefix = udise[:2] if len(udise) >= 2 else ""
    state = UDISE_STATE_PREFIX.get(prefix, "")

    pdf_rel = prov.get("pdfRelativePath") or prov.get("pdf_relative_path")
    pdf_name = Path(str(pdf_rel)).name if pdf_rel else f"{udise}.pdf"

    school = SchoolRow(
        udise=udise,
        school_name="JAWAHAR NAVODAYA VIDYALAYA",
        state=state,
        district="",
        region_code="",
        region_name="",
        academic_year=str(prov.get("academicYear") or "").strip(),
        total_students=total_students,
        total_boys=total_boys,
        total_girls=total_girls,
        source_pdf_name=pdf_name,
        parse_confidence=_mean_confidence(data.get("confidenceBySection")),
        notes="built_from_crawler_extractions_json",
    )
    fill_region(school)

    social = _social_rows(udise, st.get("enrolmentSocial"))
    minority = _minority_rows(udise, st.get("enrolmentMinority"))
    others = _others_rows(udise, st.get("enrolmentOthers"))
    age = _age_rows(udise, st.get("enrolmentAge"))
    facilities = _facilities(udise, st)

    # Hotfix: Parse teachers directly from PDF since JSONs lack it
    pdf_path = Path(str(pdf_rel)) if pdf_rel else Path(f"c:/Users/RANA/Desktop/learn_git/jnv-platform/tools/pmshri-crawler/data/pdfs/{udise}.pdf")
    if not pdf_path.is_absolute():
        pdf_path = _repo_root() / pdf_path
    
    teachers = []
    if pdf_path.exists():
        text, _ = extract_pdf_text(pdf_path)
        t_parsed = parse_teachers_section(text)
        teachers = [TeacherRow(udise=udise, **r) for r in t_parsed]

    return ParsedSchoolData(
        school=school,
        social=social,
        minority=minority,
        others=others,
        age=age,
        teachers=teachers,
        facilities=facilities,
        warnings=[],
        errors=[],
    )


def load_all(extractions_dir: Path) -> list[ParsedSchoolData]:
    records: list[ParsedSchoolData] = []
    paths = sorted(extractions_dir.glob("*.json"))
    for i, p in enumerate(paths):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"skip {p.name}: {e}")
            continue
        rec = parsed_from_extraction_obj(data, p.name)
        if rec:
            records.append(rec)
        if (i+1) % 50 == 0:
            print(f"Processed {i+1} JSON extractions...")
    return records


def main() -> int:
    root = _repo_root()
    p = argparse.ArgumentParser(description="Build master Excel from crawler extraction JSON files.")
    p.add_argument(
        "--extractions",
        type=Path,
        default=root / "jnv-platform" / "tools" / "pmshri-crawler" / "data" / "extractions",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=root / "jnv_pipeline" / "output" / "JNV_bulk_import_ready_MASTER.xlsx",
    )
    args = p.parse_args()
    ext_dir = args.extractions.resolve()
    out_path = args.output.resolve()

    if not ext_dir.is_dir():
        print(f"Extractions directory not found: {ext_dir}")
        return 2

    records = load_all(ext_dir)
    if not records:
        print(f"No valid extraction JSON files in {ext_dir}")
        return 2

    unique = dedupe_by_udise(records)
    sheets = flatten_records(unique)
    header_errors = validate_sheet_headers(sheets, SHEET_HEADERS)
    if header_errors:
        raise RuntimeError("Workbook header validation failed: " + "; ".join(header_errors))

    write_workbook(sheets, out_path)
    print(f"Wrote {out_path} ({len(unique)} schools from {len(records)} JSON files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
