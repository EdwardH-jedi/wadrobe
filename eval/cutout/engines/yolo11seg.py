"""YOLOv11 instance segmentation via ultralytics on MPS (Phase 4 -- stub)."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .base import CutoutEngine, EngineNotImplemented


class Yolo11SegEngine(CutoutEngine):
    model_version = "yolo11?-seg (pinned in Phase 4)"
    device = "mps"

    def run(self, image_path: Path) -> tuple[np.ndarray, float]:
        raise EngineNotImplemented("yolo11seg engine lands in Phase 4")


def create() -> CutoutEngine:
    return Yolo11SegEngine()
