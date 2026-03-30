from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


YES_NO_RE = re.compile(r"\b([12])\s*-\s*(Yes|No)\b", re.I)


def clean_text(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(value.replace("\u00a0", " ").split()).strip()


def parse_int(value: str | None) -> int | None:
    if not value:
        return None
    m = re.search(r"-?\d+", value.replace(",", ""))
    return int(m.group(0)) if m else None


def parse_bool(value: str | None) -> bool | None:
    if not value:
        return None
    v = clean_text(value)
    m = YES_NO_RE.search(v)
    if m:
        return m.group(2).lower() == "yes"
    if v.upper() in {"TRUE", "YES"}:
        return True
    if v.upper() in {"FALSE", "NO"}:
        return False
    return None


def normalize_academic_year(value: str | None) -> str:
    if not value:
        return ""
    m = re.search(r"(20\d{2})\s*[-/]\s*(\d{2,4})", value)
    if not m:
        return ""
    right = m.group(2)
    if len(right) == 4:
        right = right[-2:]
    return f"{m.group(1)}-{right}"


def extract_udise(text: str, fallback_name: str = "") -> str:
    m = re.search(r"\b(\d{11})\b", text)
    if m:
        return m.group(1)
    # masked UDISE in text; recover from filename if possible
    m2 = re.search(r"(\d{11})", fallback_name)
    return m2.group(1) if m2 else ""


def score_ratio(hits: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round(max(0.0, min(1.0, hits / total)), 2)


def append_jsonl(path: Path, obj: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=True) + "\n")
