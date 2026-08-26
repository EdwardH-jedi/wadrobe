"""Manifest loading + schema validation, shared by run.py and sanity.py.

The manifest is a JSON array of entries:

    [{"id": "001", "file": "images/001.jpg", "class": "lace",
      "source": "own", "note": "sleeve interior gap"}]

`id` and `file` are required (the runner needs them); `class`/`source`/`note`
and any other key are free-form metadata carried along for analysis.

Validation is strict and eager: every problem in the file is collected and
reported at once, and a missing key or a missing image file aborts the run
before any engine starts.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

REQUIRED_KEYS = ("id", "file")

# `id` becomes a filename (out/<engine>/masks/<id>.png), so keep it path-safe.
ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


class ManifestError(Exception):
    """Manifest is missing, malformed, or references a file that is not there."""


@dataclass(frozen=True)
class ManifestEntry:
    id: str
    file: str
    #: Absolute path, resolved relative to the manifest's own directory.
    path: Path
    #: Every other key from the entry, untouched.
    meta: dict


def load_manifest(manifest_path: Path) -> list[ManifestEntry]:
    manifest_path = manifest_path.expanduser().resolve()
    if not manifest_path.is_file():
        raise ManifestError(f"manifest not found: {manifest_path}")

    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ManifestError(f"manifest is not valid JSON: {exc}") from exc

    if not isinstance(raw, list):
        raise ManifestError(
            f"manifest must be a JSON array, got {type(raw).__name__}"
        )
    if not raw:
        raise ManifestError("manifest is empty -- nothing to benchmark")

    base = manifest_path.parent
    problems: list[str] = []
    entries: list[ManifestEntry] = []
    seen_ids: set[str] = set()

    for index, item in enumerate(raw):
        where = f"entry[{index}]"
        if not isinstance(item, dict):
            problems.append(f"{where}: must be an object, got {type(item).__name__}")
            continue

        missing = [k for k in REQUIRED_KEYS if k not in item]
        if missing:
            problems.append(f"{where}: missing required key(s): {', '.join(missing)}")
            continue

        entry_id, file_ref = item["id"], item["file"]
        if not isinstance(entry_id, str) or not entry_id.strip():
            problems.append(f"{where}: 'id' must be a non-empty string")
            continue
        if not ID_PATTERN.match(entry_id):
            problems.append(
                f"{where}: id {entry_id!r} must match {ID_PATTERN.pattern} "
                "(it is used as a mask filename)"
            )
            continue
        if entry_id in seen_ids:
            problems.append(f"{where}: duplicate id {entry_id!r}")
            continue
        seen_ids.add(entry_id)

        if not isinstance(file_ref, str) or not file_ref.strip():
            problems.append(f"{where} (id={entry_id}): 'file' must be a non-empty string")
            continue

        path = (base / file_ref).resolve()
        if not path.is_file():
            problems.append(f"{where} (id={entry_id}): image not found: {path}")
            continue

        meta = {k: v for k, v in item.items() if k not in REQUIRED_KEYS}
        entries.append(ManifestEntry(id=entry_id, file=file_ref, path=path, meta=meta))

    if problems:
        listed = "\n  - ".join(problems)
        raise ManifestError(
            f"{manifest_path} failed validation ({len(problems)} problem(s)):\n"
            f"  - {listed}"
        )

    return entries
