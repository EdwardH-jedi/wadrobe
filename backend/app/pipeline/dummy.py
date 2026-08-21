"""Honest stub stage implementations (Track B — experimental).

Every stage here is a deterministic placeholder. ``DummyBodyEstimator`` and
``DummyTextureProjector`` are what ``default_pipeline()`` still runs;
``DummyAvatarBuilder`` and ``DummyOutfitFitter`` have been superseded there by
``mannequin.ProceduralMannequinBuilder`` and ``fitter.BboxOutfitFitter`` and are
kept as cheap test doubles.

Nothing here is a real body, a body scan, or an accurate fit. Each stage records
an honest note so the job's provenance trail says exactly what ran.
"""

from __future__ import annotations

import trimesh

from app.pipeline.interfaces import (
    AvatarInputs,
    AvatarMesh,
    BodyProportions,
)


class DummyBodyEstimator:
    def estimate(self, inputs: AvatarInputs) -> BodyProportions:
        return BodyProportions()  # canned defaults; the image is not measured


class DummyAvatarBuilder:
    """A single box at body scale — the cheapest stand-in, kept for tests.
    ``mannequin.ProceduralMannequinBuilder`` is what the default pipeline runs.
    Neither is a real body."""

    def build(self, proportions: BodyProportions) -> AvatarMesh:
        box = trimesh.creation.box(
            extents=(
                proportions.shoulder_width,
                proportions.height,
                proportions.hip_width,
            )
        )
        scene = trimesh.Scene(box)
        return AvatarMesh(scene=scene, notes=["placeholder-box (B4a)"])


class DummyTextureProjector:
    def project(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh:
        if inputs.face_image is not None:
            mesh.notes.append("face-texture: not applied (B4a pass-through)")
        return mesh


class DummyOutfitFitter:
    """No-op fitter kept as a test double; ``fitter.BboxOutfitFitter`` is what
    the default pipeline runs."""

    def fit(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh:
        if inputs.outfit_glb is not None:
            mesh.notes.append("outfit-fit: not applied (stub fitter)")
        return mesh


class DummyExporter:
    def export(self, mesh: AvatarMesh) -> bytes:
        glb = mesh.scene.export(file_type="glb")
        return glb if isinstance(glb, bytes) else bytes(glb)
