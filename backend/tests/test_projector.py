"""Tests for the planar garment texture projector (Track B, Phase B5b)."""

from __future__ import annotations

import io

import numpy as np
import pygltflib
import pytest
import trimesh

from app import jobs
from app.pipeline.dummy import DummyAvatarBuilder, DummyExporter
from app.pipeline.interfaces import AvatarInputs, AvatarMesh, BodyProportions
from app.pipeline.mannequin import ProceduralMannequinBuilder
from app.pipeline.projector import PlanarGarmentTextureProjector
from app.pipeline.runner import default_pipeline
from tests.conftest import (
    make_corrupt_png_bytes,
    make_opaque_png,
    make_transparent_garment_png,
)

_GLB_MAGIC = b"glTF"
_GARMENT_RGB = (180, 40, 40)  # the fill used by make_transparent_garment_png


@pytest.fixture(autouse=True)
def isolated_jobs_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARWARDROBE_JOBS_DATA", str(tmp_path / "jobs"))


def _mannequin() -> AvatarMesh:
    return ProceduralMannequinBuilder().build(BodyProportions())


def _textured(mesh: AvatarMesh) -> dict[str, trimesh.Trimesh]:
    return {
        name: geom
        for name, geom in mesh.scene.geometry.items()
        if isinstance(geom.visual, trimesh.visual.TextureVisuals)
    }


def _project(mesh: AvatarMesh, image: bytes | None = None) -> AvatarMesh:
    body = image if image is not None else make_transparent_garment_png()
    return PlanarGarmentTextureProjector().project(
        mesh, AvatarInputs(body_image=body)
    )


# --- Test 1: the texture actually lands on torso + legs ----------------------


def test_project_textures_the_torso_and_leg_parts():
    mesh = _project(_mannequin())
    textured = _textured(mesh)
    # Torso + two legs of the seven mannequin primitives.
    assert len(textured) == 3
    assert len(textured) < len(mesh.scene.geometry)  # head/neck/arms untouched
    for geom in textured.values():
        assert geom.visual.material.baseColorTexture is not None


def test_untextured_parts_sit_above_or_outside_the_torso_leg_region():
    mesh = _project(_mannequin())
    textured = _textured(mesh)
    low, high = mesh.scene.bounds
    height = high[1] - low[1]
    half_width = (high[0] - low[0]) / 2.0

    for name, geom in mesh.scene.geometry.items():
        center = (geom.vertices.min(axis=0) + geom.vertices.max(axis=0)) / 2.0
        head_ward = (center[1] - low[1]) / height > 0.80  # head / neck
        out_ward = abs(center[0]) / half_width > 0.50  # arms
        assert (name in textured) == (not (head_ward or out_ward))


def test_uv_coordinates_cover_the_unit_square():
    mesh = _project(_mannequin())
    uvs = np.vstack([g.visual.uv for g in _textured(mesh).values()])
    assert uvs.shape[1] == 2
    assert uvs.min() >= -1e-9 and uvs.max() <= 1.0 + 1e-9
    # A planar map over the region bbox reaches both extremes on both axes.
    assert uvs[:, 0].min() == pytest.approx(0.0, abs=1e-6)
    assert uvs[:, 0].max() == pytest.approx(1.0, abs=1e-6)
    assert uvs[:, 1].min() == pytest.approx(0.0, abs=1e-6)
    assert uvs[:, 1].max() == pytest.approx(1.0, abs=1e-6)


def test_uv_count_matches_vertex_count_per_part():
    mesh = _project(_mannequin())
    for geom in _textured(mesh).values():
        assert geom.visual.uv.shape[0] == geom.vertices.shape[0]


def test_opaque_jpeg_style_image_without_alpha_also_projects():
    mesh = _project(_mannequin(), make_opaque_png())
    assert len(_textured(mesh)) == 3


def test_single_box_mesh_falls_back_to_texturing_itself():
    mesh = _project(DummyAvatarBuilder().build(BodyProportions()))
    assert len(_textured(mesh)) == 1


# --- Test 2: GLB round trip actually carries the texture ---------------------


def test_exported_glb_round_trips_with_texture_data():
    mesh = _project(_mannequin())
    glb = DummyExporter().export(mesh)
    assert glb.startswith(_GLB_MAGIC)

    # Standard parser: the container declares embedded image/texture data.
    parsed = pygltflib.GLTF2.load_from_bytes(glb)
    assert parsed.images, "expected an embedded texture image"
    assert parsed.textures
    assert any(
        m.pbrMetallicRoughness.baseColorTexture is not None
        for m in parsed.materials
    )

    # trimesh round trip: UVs and the decoded bitmap survive the export.
    scene = trimesh.load(io.BytesIO(glb), file_type="glb", process=False)
    reloaded = [
        geom
        for geom in scene.geometry.values()
        if isinstance(geom.visual, trimesh.visual.TextureVisuals)
        and geom.visual.material.baseColorTexture is not None
    ]
    assert len(reloaded) == 3
    for geom in reloaded:
        assert geom.visual.uv.shape == (geom.vertices.shape[0], 2)

    # The bitmap is the uploaded garment photo, not a blank placeholder.
    pixels = np.asarray(
        reloaded[0].visual.material.baseColorTexture.convert("RGB"),
        dtype=np.float64,
    ).reshape(-1, 3)
    distance = np.linalg.norm(pixels - np.array(_GARMENT_RGB), axis=1)
    assert distance.min() < 30.0


def test_pipeline_glb_is_textured_end_to_end():
    glb, notes = default_pipeline().run(
        AvatarInputs(body_image=make_transparent_garment_png())
    )
    assert glb.startswith(_GLB_MAGIC)
    assert any("garment-texture" in note for note in notes)
    assert pygltflib.GLTF2.load_from_bytes(glb).images


# --- Test 3: no image -> mesh unchanged (a normal result) --------------------


def test_no_garment_image_returns_mesh_unchanged():
    mesh = _mannequin()
    before = len(mesh.scene.geometry)
    PlanarGarmentTextureProjector().project(mesh, AvatarInputs(body_image=b""))
    assert len(mesh.scene.geometry) == before
    assert not _textured(mesh)
    assert not any("garment-texture" in note for note in mesh.notes)


def test_face_image_is_still_honestly_reported_as_not_applied():
    mesh = _mannequin()
    PlanarGarmentTextureProjector().project(
        mesh, AvatarInputs(body_image=b"", face_image=b"whatever")
    )
    assert any("face-texture" in note for note in mesh.notes)


# --- Test 4: unusable image bytes -> raise -> job FAILED ---------------------


@pytest.mark.parametrize(
    "payload", [b"not an image", make_corrupt_png_bytes()], ids=["junk", "corrupt"]
)
def test_unusable_image_bytes_raise(payload):
    with pytest.raises(Exception):
        PlanarGarmentTextureProjector().project(
            _mannequin(), AvatarInputs(body_image=payload)
        )


def test_unusable_image_marks_job_failed_with_no_result(client):
    job = jobs.store.create()
    jobs.store.process(job.id, AvatarInputs(body_image=b"not an image"))
    settled = jobs.store.get(job.id)
    assert settled is not None
    assert settled.state == jobs.JobState.FAILED
    assert settled.error  # non-empty honest error
    assert jobs.glb_path(job.id) is None  # nothing written on failure

    response = client.get(f"/api/jobs/{job.id}/result.glb")
    assert response.status_code == 409


# --- Test 5: honest provenance ----------------------------------------------


def test_projection_notes_are_honest_about_being_a_projection():
    mesh = _project(_mannequin())
    joined = " ".join(mesh.notes).lower()
    assert "planar" in joined and "projection" in joined
    # The limits are stated, not merely omitted.
    assert "not garment reconstruction" in joined
    assert "not a fit estimate" in joined
    for forbidden in ("real try-on", "virtual try-on", "accurate fit", "3d scan"):
        assert forbidden not in joined
