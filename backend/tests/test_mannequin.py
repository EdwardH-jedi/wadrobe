"""Tests for the procedural mannequin builder (Track B, Phase B4b)."""

from __future__ import annotations

import trimesh

from app.pipeline.dummy import DummyExporter
from app.pipeline.interfaces import AvatarMesh, BodyProportions
from app.pipeline.mannequin import ProceduralMannequinBuilder

_GLB_MAGIC = b"glTF"


def _body(mesh: AvatarMesh) -> trimesh.Trimesh:
    """Concatenate the scene back into a single mesh for measurement."""
    return trimesh.util.concatenate(tuple(mesh.scene.geometry.values()))


def _extents(mesh: AvatarMesh):
    return _body(mesh).extents  # [x, y, z] bounding-box extents


def test_build_returns_non_empty_mesh_richer_than_a_box():
    mesh = ProceduralMannequinBuilder().build(BodyProportions())
    body = _body(mesh)

    # A single trimesh box has 8 vertices / 12 faces — the mannequin is far richer.
    box = trimesh.creation.box(extents=(1.0, 1.0, 1.0))
    assert len(body.vertices) > len(box.vertices)
    assert len(body.faces) > len(box.faces)
    assert len(body.vertices) > 100


def test_mannequin_has_multiple_distinct_parts():
    mesh = ProceduralMannequinBuilder().build(BodyProportions())
    # head, neck, torso, two arms, two legs = 7 distinct scene geometries.
    assert len(mesh.scene.geometry) >= 6


def test_taller_height_yields_taller_bbox():
    builder = ProceduralMannequinBuilder()
    base = _extents(builder.build(BodyProportions(height=1.8)))
    tall = _extents(builder.build(BodyProportions(height=2.4)))
    assert tall[1] > base[1]  # Y is the vertical axis


def test_wider_shoulders_yield_wider_bbox():
    builder = ProceduralMannequinBuilder()
    base = _extents(builder.build(BodyProportions(shoulder_width=0.45)))
    wide = _extents(builder.build(BodyProportions(shoulder_width=0.90)))
    assert wide[0] > base[0]  # X is the horizontal (shoulder) axis


def test_stands_upright_y_up_feet_near_ground():
    mesh = ProceduralMannequinBuilder().build(BodyProportions(height=1.8))
    bounds = _body(mesh).bounds  # [[min_x,min_y,min_z],[max_x,max_y,max_z]]
    min_y, max_y = bounds[0][1], bounds[1][1]
    # Vertical span dominates (taller than wide) and the figure is right-side-up.
    assert max_y - min_y > _extents(mesh)[0]
    assert abs(min_y) < 0.05  # feet rest near the y=0 ground plane


def test_mannequin_exports_to_valid_glb():
    mesh = ProceduralMannequinBuilder().build(BodyProportions())
    glb = DummyExporter().export(mesh)
    assert isinstance(glb, bytes)
    assert glb.startswith(_GLB_MAGIC)


def test_build_notes_are_honest_mannequin_proxy():
    mesh = ProceduralMannequinBuilder().build(BodyProportions())
    assert any("mannequin" in note for note in mesh.notes)
    joined = " ".join(mesh.notes).lower()
    for forbidden in ("real avatar", "body scan", "accurate fit"):
        assert forbidden not in joined
