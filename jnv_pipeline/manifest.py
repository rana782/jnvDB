from __future__ import annotations

import json
from pathlib import Path


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return {"processed_successfully": [], "failed": [], "last_batch": 0}
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    data.setdefault("processed_successfully", [])
    data.setdefault("failed", [])
    data.setdefault("last_batch", 0)
    return data


def save_manifest(path: Path, manifest: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=True)


def mark_success(manifest: dict, pdf_name: str) -> None:
    if pdf_name not in manifest["processed_successfully"]:
        manifest["processed_successfully"].append(pdf_name)
    if pdf_name in manifest["failed"]:
        manifest["failed"].remove(pdf_name)


def mark_failure(manifest: dict, pdf_name: str) -> None:
    if pdf_name not in manifest["failed"]:
        manifest["failed"].append(pdf_name)
