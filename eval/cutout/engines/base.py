"""Engine contract for the cutout benchmark.

An engine is ONE module under `eval/cutout/engines/` that exposes a module-level

    create() -> CutoutEngine

That is the entire contract. Dropping a new file into this directory makes
`run.py --engine <module-stem>` work with no edit anywhere else: `run.py`
discovers engines by globbing this package.

Why a factory returning an object, rather than a bare
`(image_path) -> (mask, ms)` function: two of the three engines need one-time
setup that must stay OUT of the measured window -- YOLO loads weights once, and
the Vision engine keeps a single long-lived Swift subprocess (restarting it per
image would fold process-launch cost into `ms`). `create()` owns that setup;
`run()` is the per-image callable the benchmark actually times.

Division of labour with the runner:
  * The engine returns a mask and its own inference time, or raises.
  * The runner owns PNG encoding, `coverage_ratio`, error capture, and
    results.json. Engines never touch the output directory.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

import numpy as np


class CutoutEngine(ABC):
    """One configured, ready-to-run cutout backend."""

    #: Free-form version identifier recorded in results.json `env.model_version`
    #: (e.g. a weights filename, a framework version, "n/a" for pure algorithms).
    model_version: str = "unknown"

    #: Compute device actually used, recorded in `env.device`
    #: (e.g. "cpu", "mps", "coreml").
    device: str = "cpu"

    @abstractmethod
    def run(self, image_path: Path) -> tuple[np.ndarray, float]:
        """Segment one image.

        Returns `(mask, elapsed_ms)` where:
          * `mask` is a 2-D array at the ORIGINAL image resolution, foreground
            255 / background 0 (the runner normalises dtype, but not shape).
          * `elapsed_ms` is inference time ONLY -- decoding/loading the image
            must be excluded, so each engine times its own inner call.

        Raise on failure. The runner records the exception per image and moves
        on to the next one; a single bad image never aborts the run.
        """

    def close(self) -> None:
        """Release one-time resources (subprocesses, models). Default: no-op."""


class EngineNotImplemented(NotImplementedError):
    """Raised by a stub engine that has not been built yet."""
