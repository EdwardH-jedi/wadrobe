"""Tests for the bbox outfit fitter (Track B, Phase B5a)."""

from __future__ import annotations

import numpy as np
import pytest
import trimesh

from app import jobs
from app.pipeline.fitter import BboxOutfitFitter
from app.pipeline.interfaces import AvatarInputs, BodyProportions
from app.pipeline.mannequin import ProceduralMannequinBuilder
from app.pipeline.runner import default_pipeline

_GLB_MAGIC = b"glTF"


@pytest.fixture(autouse=True)
def isolated_jobs_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "jobs"))


def _outfit_glb(extents=(0.6, 0.9, 0.4), translate=None) -> bytes:
    box = trimesh.creation.box(extents=extents)
    if translate is not None:
        box.apply_translation(translate)
    glb = trimesh.Scene(box).export(file_type="glb")
    return glb if isinstance(glb, bytes) else bytes(glb)


def _mannequin():
    return ProceduralMannequinBuilder().build(BodyProportions())


# --- Test 1: a valid outfit is actually merged -------------------------------


def test_fit_adds_outfit_geometry_to_scene():
    mesh = _mannequin()
    before = len(mesh.scene.geometry)
    BboxOutfitFitter().fit(mesh, AvatarInputs(body_image=b"x", outfit_glb=_outfit_glb()))
    assert len(mesh.scene.geometry) > before
    assert any("outfit-fit" in note for note in mesh.notes)


def test_pipeline_with_outfit_exports_one_glb():
    inputs = AvatarInputs(body_image=b"x", outfit_glb=_outfit_glb())
    glb, notes = default_pipeline().run(inputs)
    assert glb.startswith(_GLB_MAGIC)
    assert any("outfit-fit" in note for note in notes)


# --- Test 2: fitted, not raw-pasted ------------------------------------------


def test_outfit_is_bbox_fitted_not_raw_pasted():
    # A huge, far-off-center outfit: a raw paste would explode/translate the
    # combined bounds; a bbox fit keeps them ~the mannequin's.
    mannequin_extents = _mannequin().scene.extents
    mesh = _mannequin()
    mannequin_center = mesh.scene.bounds.mean(axis=0)

    BboxOutfitFitter().fit(
        mesh,
        AvatarInputs(
            body_image=b"x",
            outfit_glb=_outfit_glb(extents=(10.0, 10.0, 10.0), translate=[50, 50, 50]),
        ),
    )

    combined_extents = mesh.scene.extents
    combined_center = mesh.scene.bounds.mean(axis=0)
    # Not exploded: combined bbox stays within a small factor of the mannequin's.
    assert np.all(combined_extents <= mannequin_extents * 1.5 + 1e-6)
    # Not pasted far away: the merged content stays centered on the body.
    assert np.allclose(combined_center, mannequin_center, atol=0.25)


# --- Test 3: no outfit -> mannequin only -------------------------------------


def test_no_outfit_returns_mannequin_only():
    mesh = _mannequin()
    before = len(mesh.scene.geometry)
    BboxOutfitFitter().fit(mesh, AvatarInputs(body_image=b"x", outfit_glb=None))
    assert len(mesh.scene.geometry) == before
    assert not any("outfit-fit" in note for note in mesh.notes)


# --- Test 4: invalid outfit -> raise -> job FAILED ---------------------------


def test_invalid_outfit_raises():
    mesh = _mannequin()
    with pytest.raises(Exception):
        BboxOutfitFitter().fit(
            mesh, AvatarInputs(body_image=b"x", outfit_glb=b"not a glb")
        )


def test_invalid_outfit_marks_job_failed_with_no_result(client):
    job = jobs.store.create()
    jobs.store.process(
        job.id, AvatarInputs(body_image=b"x", outfit_glb=b"not a glb")
    )
    settled = jobs.store.get(job.id)
    assert settled is not None
    assert settled.state == jobs.JobState.FAILED
    assert settled.error  # non-empty honest error
    assert jobs.glb_path(job.id) is None  # nothing written on failure

    response = client.get(f"/api/jobs/{job.id}/result.glb")
    assert response.status_code == 409
