"""Local-disk job storage for proxy-3D results.

Each job lives in ``<data root>/<job_id>/`` holding ``result.glb`` and
``metadata.json``. The data root defaults to ``backend/data/proxy_3d`` and
can be overridden with the ``AVATARWARDROBE_PROXY3D_DATA`` environment
variable (tests point it at a temp directory).
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

_JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")

_DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "data" / "proxy_3d"


def data_root() -> Path:
    override = os.environ.get("AVATARWARDROBE_PROXY3D_DATA")
    return Path(override) if override else _DEFAULT_ROOT


def is_valid_job_id(job_id: str) -> bool:
    return bool(_JOB_ID_RE.match(job_id))


def save_job(job_id: str, glb_bytes: bytes, record: dict) -> None:
    job_dir = data_root() / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "result.glb").write_bytes(glb_bytes)
    (job_dir / "metadata.json").write_text(
        json.dumps(record, indent=2), encoding="utf-8"
    )


def load_record(job_id: str) -> dict | None:
    if not is_valid_job_id(job_id):
        return None
    meta = data_root() / job_id / "metadata.json"
    if not meta.is_file():
        return None
    return json.loads(meta.read_text(encoding="utf-8"))


def glb_path(job_id: str) -> Path | None:
    if not is_valid_job_id(job_id):
        return None
    path = data_root() / job_id / "result.glb"
    return path if path.is_file() else None
