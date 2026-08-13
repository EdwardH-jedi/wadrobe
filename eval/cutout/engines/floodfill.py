"""Edge-seeded flood-fill cutout (Phase 2 -- stub).

Port of the app's on-device background remover
(`src/lib/image/garmentCutout.ts`), copied and adapted here rather than
imported: `src/` is read-only for this benchmark.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .base import CutoutEngine, EngineNotImplemented


class FloodFillEngine(CutoutEngine):
    model_version = "n/a (edge-seeded flood fill)"
    device = "cpu"

    def run(self, image_path: Path) -> tuple[np.ndarray, float]:
        raise EngineNotImplemented("floodfill engine lands in Phase 2")


def create() -> CutoutEngine:
    return FloodFillEngine()
