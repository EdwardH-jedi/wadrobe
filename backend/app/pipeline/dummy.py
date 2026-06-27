"""Honest dummy stage implementations (Track B, Phase B4a).

Every stage is a deterministic placeholder. The avatar is a single box at body
scale — explicitly NOT a real body, a body scan, or an accurate fit. Each stage
records an honest note so the job's provenance trail says exactly what ran.
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
        return BodyProportions()  # canned; B4b may scale from image aspect


class DummyAvatarBuilder:
    """B4a placeholder: a single box at body scale. B4b replaces this with a
    procedural trimesh mannequin. The mesh is intentionally NOT a real body."""

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
    def fit(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh:
        if inputs.outfit_glb is not None:
            mesh.notes.append("outfit-fit: deferred to B5")
        return mesh  # B5 implements real bbox merge


class DummyExporter:
    def export(self, mesh: AvatarMesh) -> bytes:
        glb = mesh.scene.export(file_type="glb")
        return glb if isinstance(glb, bytes) else bytes(glb)
