from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class PipelineConfig:
    input_dir: Path
    output_dir: Path
    manifest_path: Path
    log_path: Path
    batch_size: int = 50
    recursive: bool = True
    demo_pdf: Path | None = None

    def ensure_dirs(self) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
