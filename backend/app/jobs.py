"""In-memory async job store + lifecycle (Track B, Phase B4a).

State (queued/processing/done/failed) lives in a thread-safe in-memory map; the
result GLB persists to disk. The disk layout mirrors ``storage.py`` exactly —
``<jobs root>/<job_id>/result.glb`` + ``metadata.json`` — but on a SEPARATE root
(``AVATARWARDROBE_JOBS_DATA``), so the proxy-3D storage is never touched.

The metadata records the avatar provenance honestly (``notes``): the avatar is
a procedural mannequin proxy assembled from primitives (B4b), not a real avatar
/ body scan / accurate fit.
"""

from __future__ import annotations

import json
import os
import shutil
import time
import re
import threading
import uuid
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from app.pipeline.interfaces import AvatarInputs
from app.pipeline.runner import AvatarPipeline, default_pipeline


class JobState(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


@dataclass
class Job:
    id: str
    state: JobState
    error: str | None = None
    notes: list[str] | None = None


_JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "data" / "jobs"


def jobs_root() -> Path:
    """Resolve the jobs data root at call time (env override mirrors storage)."""
    override = os.environ.get("AVATARWARDROBE_JOBS_DATA")
    return Path(override) if override else _DEFAULT_ROOT


def is_valid_job_id(job_id: str) -> bool:
    return bool(_JOB_ID_RE.match(job_id))


def glb_path(job_id: str) -> Path | None:
    if not is_valid_job_id(job_id):
        return None
    path = jobs_root() / job_id / "result.glb"
    return path if path.is_file() else None


class JobStore:
    """Thread-safe in-memory job state. Result GLB persists to disk."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self) -> Job:
        job = Job(id=uuid.uuid4().hex, state=JobState.QUEUED)
        with self._lock:
            self._jobs[job.id] = job
        return job

    def active_count(self) -> int:
        """Jobs not yet finished. Used to bound how many can run at once."""
        with self._lock:
            return sum(
                1
                for job in self._jobs.values()
                if job.state in (JobState.QUEUED, JobState.PROCESSING)
            )

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def _update(self, job_id: str, **fields) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for key, value in fields.items():
                setattr(job, key, value)

    def process(
        self,
        job_id: str,
        inputs: AvatarInputs,
        pipeline: AvatarPipeline | None = None,
    ) -> None:
        """Run one job to completion. Called via BackgroundTasks."""
        pipeline = pipeline or default_pipeline()
        self._update(job_id, state=JobState.PROCESSING)
        try:
            glb, notes = pipeline.run(inputs)
            job_dir = jobs_root() / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            (job_dir / "result.glb").write_bytes(glb)
            (job_dir / "metadata.json").write_text(
                json.dumps(
                    {
                        "id": job_id,
                        "notes": notes,
                        "proxy": True,
                        "limitations": (
                            "Procedural mannequin proxy assembled from "
                            "primitives; any outfit is bounding-box aligned, "
                            "not cloth-simulated (B5a). Not a real avatar, body "
                            "scan, accurate fit, or real garment fit."
                        ),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            self._update(job_id, state=JobState.DONE, notes=notes)
        except Exception as exc:  # honest failure, never crash the worker
            self._update(job_id, state=JobState.FAILED, error=str(exc))


# Module singleton (mirrors proxy-3d's module-level storage usage).
store = JobStore()


def sweep_expired(ttl_seconds: int | None = None) -> int:
    """Delete generated artifacts older than the TTL.

    Job output is disposable — the GLB can always be regenerated — but nothing
    used to remove it, so the data directory grew for the life of the process.
    Swept on job creation rather than on a timer: no scheduler, no background
    thread, and the cost lands on whoever is adding more files.

    Returns the number of job directories removed. Never raises: a failed sweep
    must not fail the request that triggered it.
    """
    from app import config

    ttl = config.JOB_ARTIFACT_TTL_SECONDS if ttl_seconds is None else ttl_seconds
    root = jobs_root()
    removed = 0
    try:
        if not root.exists():
            return 0
        cutoff = time.time() - ttl
        for entry in root.iterdir():
            if not entry.is_dir() or not is_valid_job_id(entry.name):
                continue
            try:
                if entry.stat().st_mtime >= cutoff:
                    continue
                shutil.rmtree(entry, ignore_errors=True)
                removed += 1
            except OSError:
                continue
    except OSError:
        return removed
    return removed
