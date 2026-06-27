"""Pipeline contracts (Track B, Phase B4a) — the core deliverable.

Five stage Protocols plus the small dataclasses that flow between them. The
Protocols let B4b/B5 replace one stage (e.g. a real mannequin builder) without
changing the runner, the job store, or the API surface.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class AvatarInputs:
    """Raw user inputs for one avatar job."""

    body_image: bytes
    face_image: bytes | None = None
    outfit_glb: bytes | None = None  # consumed in B5 (IOutfitFitter)


@dataclass(frozen=True)
class BodyProportions:
    """Canned proportions in normalized units. B4b may scale height from the
    body image's aspect ratio; B4a returns deterministic defaults."""

    height: float = 1.8
    shoulder_width: float = 0.45
    hip_width: float = 0.38


@dataclass
class AvatarMesh:
    """Wraps a trimesh.Scene as it flows through the pipeline."""

    scene: object  # trimesh.Scene
    notes: list[str] = field(default_factory=list)  # honest provenance trail


class IBodyEstimator(Protocol):
    def estimate(self, inputs: AvatarInputs) -> BodyProportions: ...


class IAvatarBuilder(Protocol):
    def build(self, proportions: BodyProportions) -> AvatarMesh: ...


class ITextureProjector(Protocol):
    def project(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh: ...


class IOutfitFitter(Protocol):
    def fit(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh: ...


class IExporter(Protocol):
    def export(self, mesh: AvatarMesh) -> bytes: ...  # returns GLB bytes
