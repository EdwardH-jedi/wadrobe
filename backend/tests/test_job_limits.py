"""Containment for the EXPERIMENTAL avatar-jobs surface.

Nothing consumes this API, but it is reachable whenever the service runs, so it
must not be usable to exhaust memory or disk. These are bounds, not
infrastructure — no queue, no scheduler.
"""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app import config, jobs
from app.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "jobs"))
    return TestClient(app)


def test_oversized_body_upload_is_refused_not_buffered(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 1024)
    oversized = b"\x00" * 4096

    res = client.post(
        "/api/jobs",
        files={"body_file": ("body.png", oversized, "image/png")},
    )

    assert res.status_code == 413
    assert "limit" in res.json()["detail"].lower()


def test_oversized_outfit_glb_is_refused(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_OUTFIT_GLB_BYTES", 1024)

    res = client.post(
        "/api/jobs",
        files={
            "body_file": ("body.png", b"\x89PNG" + b"\x00" * 64, "image/png"),
            "outfit_file": ("outfit.glb", b"\x00" * 8192, "model/gltf-binary"),
        },
    )

    assert res.status_code == 413
    assert "outfit_file" in res.json()["detail"]


def test_a_body_within_the_limit_is_still_accepted(client):
    res = client.post(
        "/api/jobs",
        files={"body_file": ("body.png", b"\x89PNG" + b"\x00" * 64, "image/png")},
    )
    assert res.status_code == 202
    assert res.json()["state"] in {"queued", "processing", "done", "failed"}


def test_sweep_removes_expired_artifacts_and_keeps_fresh_ones(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "jobs"))
    root = jobs.jobs_root()
    root.mkdir(parents=True, exist_ok=True)

    stale = root / ("a" * 32)
    fresh = root / ("b" * 32)
    for directory in (stale, fresh):
        directory.mkdir()
        (directory / "result.glb").write_bytes(b"glb")

    # Age the stale one past the TTL.
    old = time.time() - 7200
    import os

    os.utime(stale, (old, old))

    removed = jobs.sweep_expired(ttl_seconds=3600)

    assert removed == 1
    assert not stale.exists()
    assert fresh.exists(), "a recent job's artifact must survive the sweep"


def test_sweep_ignores_unrelated_entries(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "jobs"))
    root = jobs.jobs_root()
    root.mkdir(parents=True, exist_ok=True)

    # Not a job id: must never be touched, however old.
    stray = root / "not-a-job-id"
    stray.mkdir()
    old = time.time() - 999_999
    import os

    os.utime(stray, (old, old))

    jobs.sweep_expired(ttl_seconds=1)

    assert stray.exists()


def test_sweep_is_safe_when_the_directory_does_not_exist(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "absent"))
    assert jobs.sweep_expired(ttl_seconds=1) == 0
