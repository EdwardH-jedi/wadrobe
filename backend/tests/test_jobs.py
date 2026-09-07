"""Tests for the avatar jobs API + pipeline (Track B, Phase B4a)."""

from __future__ import annotations

import re

import pytest
import trimesh

from app import jobs
from app.pipeline.dummy import (
    DummyAvatarBuilder,
    DummyBodyEstimator,
    DummyExporter,
    DummyOutfitFitter,
    DummyTextureProjector,
)
from app.pipeline.interfaces import AvatarInputs, AvatarMesh, BodyProportions
from app.pipeline.runner import AvatarPipeline, default_pipeline
from tests.conftest import make_transparent_garment_png

_HEX32 = re.compile(r"^[0-9a-f]{32}$")
_GLB_MAGIC = b"glTF"


@pytest.fixture(autouse=True)
def isolated_jobs_dir(tmp_path, monkeypatch):
    """Keep every job's GLB output inside a temp directory (mirrors the
    proxy-3D conftest fixture, on the jobs-specific env override)."""
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "jobs"))


def _post_job(client, body: bytes | None = None):
    body = body if body is not None else make_transparent_garment_png()
    files = {"body_file": ("body.png", body, "image/png")}
    return client.post("/api/jobs", files=files)


def _poll_until_settled(client, job_id: str, tries: int = 10) -> dict:
    """BackgroundTasks run before the TestClient request returns, so the job is
    typically already done on the first GET — poll a few times defensively."""
    body: dict = {}
    for _ in range(tries):
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["state"] in ("done", "failed"):
            return body
    return body


# --- API flow (cases 1-4) ----------------------------------------------------


def test_create_job_returns_202_with_hex_id(client):
    response = _post_job(client)
    assert response.status_code == 202
    body = response.json()
    assert _HEX32.match(body["id"])
    assert body["state"] in ("queued", "processing", "done")


def test_job_reaches_done(client):
    job_id = _post_job(client).json()["id"]
    body = _poll_until_settled(client, job_id)
    assert body["state"] == "done"


def test_result_glb_has_gltf_magic(client):
    job_id = _post_job(client).json()["id"]
    assert _poll_until_settled(client, job_id)["state"] == "done"

    response = client.get(f"/api/jobs/{job_id}/result.glb")
    assert response.status_code == 200
    assert response.headers["content-type"] == "model/gltf-binary"
    assert response.content.startswith(_GLB_MAGIC)


def test_unknown_job_id_is_404(client):
    unknown = "f" * 32
    assert client.get(f"/api/jobs/{unknown}").status_code == 404
    assert client.get(f"/api/jobs/{unknown}/result.glb").status_code == 404


def test_result_not_ready_is_409(client):
    # A freshly created (queued) job has no GLB on disk yet.
    job = jobs.store.create()
    response = client.get(f"/api/jobs/{job.id}/result.glb")
    assert response.status_code == 409
    assert "not ready" in response.json()["detail"].lower()


# --- Dummy stage units (case 5) ----------------------------------------------


def test_dummy_body_estimator_returns_defaults():
    proportions = DummyBodyEstimator().estimate(
        AvatarInputs(body_image=b"x")
    )
    assert proportions == BodyProportions()
    assert proportions.height == 1.8


def test_dummy_builder_makes_non_empty_scene():
    mesh = DummyAvatarBuilder().build(BodyProportions())
    assert isinstance(mesh, AvatarMesh)
    assert len(mesh.scene.geometry) > 0
    assert any("placeholder" in note for note in mesh.notes)


def test_dummy_exporter_emits_glb_magic():
    mesh = DummyAvatarBuilder().build(BodyProportions())
    glb = DummyExporter().export(mesh)
    assert isinstance(glb, bytes)
    assert glb.startswith(_GLB_MAGIC)


# --- Runner unit (case 6) ----------------------------------------------------


def test_default_pipeline_run_returns_glb_and_mannequin_notes():
    glb, notes = default_pipeline().run(AvatarInputs(body_image=b"x"))
    assert glb.startswith(_GLB_MAGIC)
    # B4b: the default builder is the procedural mannequin, not the B4a box.
    assert any("mannequin" in note for note in notes)
    assert not any("placeholder" in note for note in notes)


def _valid_outfit_glb() -> bytes:
    glb = trimesh.Scene(trimesh.creation.box(extents=(0.5, 0.5, 0.5))).export(
        file_type="glb"
    )
    return glb if isinstance(glb, bytes) else bytes(glb)


def test_pipeline_notes_record_face_passthrough_and_outfit_fit():
    # B5a: the default fitter is real, so a VALID outfit GLB is needed for it to
    # merge (an invalid one would raise — see test_fitter.py).
    inputs = AvatarInputs(
        body_image=b"x", face_image=b"y", outfit_glb=_valid_outfit_glb()
    )
    _glb, notes = default_pipeline().run(inputs)
    assert any("face-texture" in note for note in notes)
    assert any("outfit-fit" in note for note in notes)


# --- Failure path (case 7) ---------------------------------------------------


class _BoomBuilder:
    def build(self, proportions: BodyProportions) -> AvatarMesh:
        raise RuntimeError("builder boom")


def _boom_pipeline() -> AvatarPipeline:
    return AvatarPipeline(
        estimator=DummyBodyEstimator(),
        builder=_BoomBuilder(),
        projector=DummyTextureProjector(),
        fitter=DummyOutfitFitter(),
        exporter=DummyExporter(),
    )


def test_failed_job_records_honest_error():
    job = jobs.store.create()
    jobs.store.process(job.id, AvatarInputs(body_image=b"x"), _boom_pipeline())
    settled = jobs.store.get(job.id)
    assert settled is not None
    assert settled.state == jobs.JobState.FAILED
    assert settled.error is not None
    assert "boom" in settled.error


def test_failed_job_result_is_409_with_error(client):
    job = jobs.store.create()
    jobs.store.process(job.id, AvatarInputs(body_image=b"x"), _boom_pipeline())
    response = client.get(f"/api/jobs/{job.id}/result.glb")
    assert response.status_code == 409
    assert "boom" in response.json()["detail"]


def test_finished_job_survives_a_restart(client, tmp_path):
    """A restart loses bookkeeping, not results.

    State lives in memory and output lives on disk, so a process restart used to
    404 a job whose ``result.glb`` was sitting on disk the whole time. The store
    now rebuilds a finished job from its artifacts.
    """
    created = _post_job(client)
    assert created.status_code == 202
    job_id = created.json()["id"]
    _poll_until_settled(client, job_id)

    # Simulate the restart: a brand-new store with no memory of anything, over
    # the same data directory.
    restarted = jobs.JobStore()
    recovered = restarted.get(job_id)
    assert recovered is not None
    assert recovered.state is jobs.JobState.DONE
    assert recovered.id == job_id
    # The honest provenance notes come back with it.
    assert recovered.notes


def test_an_unfinished_job_is_reported_gone_not_invented(tmp_path, monkeypatch):
    """Only a COMPLETE artifact set is recoverable.

    Reconstructing a queued or half-written job would put the client in a state
    that never existed on the server. Absent is the honest answer.
    """
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "jobs"))
    store = jobs.JobStore()
    job_id = "a" * 32

    # Nothing on disk at all.
    assert store.get(job_id) is None

    # A GLB with no metadata: the pipeline died between the two writes.
    job_dir = jobs.jobs_root() / job_id
    job_dir.mkdir(parents=True)
    (job_dir / "result.glb").write_bytes(b"glTF-partial")
    assert store.get(job_id) is None

    # Metadata that is not readable JSON is not a completed job either.
    (job_dir / "metadata.json").write_text("{not json", encoding="utf-8")
    assert store.get(job_id) is None


def test_recovery_never_overrides_a_live_job(tmp_path, monkeypatch):
    """A job still in flight outranks anything reconstructed from disk."""
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "jobs"))
    store = jobs.JobStore()
    job = store.create()

    job_dir = jobs.jobs_root() / job.id
    job_dir.mkdir(parents=True)
    (job_dir / "result.glb").write_bytes(b"glTF")
    (job_dir / "metadata.json").write_text('{"notes": ["stale"]}', encoding="utf-8")

    assert store.get(job.id).state is jobs.JobState.QUEUED


def test_recovery_rejects_a_malformed_job_id(tmp_path, monkeypatch):
    """The id is used to build a filesystem path, so it stays validated."""
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "jobs"))
    store = jobs.JobStore()
    for bad in ["../../etc", "not-hex", "", "A" * 32]:
        assert store.get(bad) is None
