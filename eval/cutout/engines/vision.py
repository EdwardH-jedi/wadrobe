"""Apple Vision cutout via VNGenerateForegroundInstanceMaskRequest (Phase 3 -- stub).

Wraps a long-lived Swift CLI (`scripts/vision-cli/`) that reads image paths on
stdin and writes JSON Lines on stdout, so the process is started once per run
instead of once per image.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .base import CutoutEngine, EngineNotImplemented


class VisionEngine(CutoutEngine):
    model_version = "VNGenerateForegroundInstanceMaskRequest"
    device = "coreml"

    def run(self, image_path: Path) -> tuple[np.ndarray, float]:
        raise EngineNotImplemented("vision engine lands in Phase 3")


def create() -> CutoutEngine:
    return VisionEngine()
