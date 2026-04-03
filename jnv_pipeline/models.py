from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class SchoolRow:
    udise: str = ""
    school_name: str = ""
    state: str = ""
    district: str = ""
    region_code: str = ""
    region_name: str = ""
    academic_year: str = ""
    total_students: int | None = None
    total_boys: int | None = None
    total_girls: int | None = None
    source_pdf_name: str = ""
    parse_confidence: float | None = None
    notes: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "udise": self.udise,
            "school_name": self.school_name,
            "state": self.state,
            "district": self.district,
            "region_code": self.region_code,
            "region_name": self.region_name,
            "academic_year": self.academic_year,
            "total_students": self.total_students,
            "total_boys": self.total_boys,
            "total_girls": self.total_girls,
            "source_pdf_name": self.source_pdf_name,
            "parse_confidence": self.parse_confidence,
            "notes": self.notes,
        }


@dataclass(slots=True)
class CategoryRow:
    udise: str
    category: str
    boys: int | None = None
    girls: int | None = None
    total: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "udise": self.udise,
            "category": self.category,
            "boys": self.boys,
            "girls": self.girls,
            "total": self.total,
        }


@dataclass(slots=True)
class TeacherRow:
    udise: str
    category: str
    label: str
    count: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "udise": self.udise,
            "category": self.category,
            "label": self.label,
            "count": self.count,
        }


@dataclass(slots=True)
class AgeRow:
    udise: str
    age_band: str
    boys: int | None = None
    girls: int | None = None
    total: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "udise": self.udise,
            "age_band": self.age_band,
            "boys": self.boys,
            "girls": self.girls,
            "total": self.total,
        }


@dataclass(slots=True)
class FacilitiesRow:
    udise: str
    water_available: bool | None = None
    electricity_available: bool | None = None
    internet_available: bool | None = None
    solar_available: bool | None = None
    playground_available: bool | None = None
    library_available: bool | None = None
    functional_toilets_b: int | None = None
    functional_toilets_g: int | None = None
    desktops: int | None = None
    laptops: int | None = None
    tablets: int | None = None
    printers: int | None = None
    smart_class_tv: int | None = None
    projectors: int | None = None
    medical_checkups: bool | None = None
    ramps_available: bool | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "udise": self.udise,
            "water_available": self.water_available,
            "electricity_available": self.electricity_available,
            "internet_available": self.internet_available,
            "solar_available": self.solar_available,
            "playground_available": self.playground_available,
            "library_available": self.library_available,
            "functional_toilets_b": self.functional_toilets_b,
            "functional_toilets_g": self.functional_toilets_g,
            "desktops": self.desktops,
            "laptops": self.laptops,
            "tablets": self.tablets,
            "printers": self.printers,
            "smart_class_tv": self.smart_class_tv,
            "projectors": self.projectors,
            "medical_checkups": self.medical_checkups,
            "ramps_available": self.ramps_available,
        }


@dataclass(slots=True)
class ParsedSchoolData:
    school: SchoolRow
    social: list[CategoryRow] = field(default_factory=list)
    minority: list[CategoryRow] = field(default_factory=list)
    others: list[CategoryRow] = field(default_factory=list)
    age: list[AgeRow] = field(default_factory=list)
    teachers: list[TeacherRow] = field(default_factory=list)
    facilities: FacilitiesRow | None = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
