"""Pipeline contracts (Track B — experimental) — the core deliverable.

Five stage Protocols plus the small dataclasses that flow between them. The
Protocols let one stage be replaced (as the procedural mannequin builder and the
bbox outfit fitter already were) without changing the runner, the job store, or
the API surface.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class AvatarInputs:
    """Raw user inputs for one avatar job."""

    body_image: bytes
    face_image: bytes | None = None
    outfit_glb: bytes | None = None  # consumed by IOutfitFitter


@dataclass(frozen=True)
class BodyProportions:
    """Proportions in normalized units. The shipped estimator returns
    deterministic defaults — nothing is measured from the body image."""

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
