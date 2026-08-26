#!/usr/bin/env python
"""Cutout benchmark runner.

Runs ONE engine over every image in a manifest and writes

    eval/cutout/out/<engine>/results.json
    eval/cutout/out/<engine>/masks/<id>.png

Usage:
    eval/cutout/.venv/bin/python eval/cutout/scripts/run.py \
        --engine floodfill --manifest eval/cutout/manifest.json

Engines are discovered by globbing `eval/cutout/engines/*.py`; each exposes a
`create()` factory (see `engines/base.py`). This module owns everything the
engines must NOT own, so numbers stay comparable across backends:

  * mask PNG encoding (8-bit grayscale, foreground 255)
  * coverage_ratio, computed identically for every engine
  * per-image error capture -- one failing image never aborts the run
  * results.json assembly

Engine setup happens once, before the loop, and is excluded from `ms`; each
engine times its own inference call so image decoding stays out of the number.
"""

from __future__ import annotations

import argparse
import importlib
import json
import platform
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

# eval/cutout -- so `engines` imports resolve regardless of the working directory.
BENCH_ROOT = Path(__file__).resolve().parents[1]
if str(BENCH_ROOT) not in sys.path:
    sys.path.insert(0, str(BENCH_ROOT))
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from engines.base import CutoutEngine  # noqa: E402
from manifest import ManifestEntry, ManifestError, load_manifest  # noqa: E402

DEFAULT_MANIFEST = BENCH_ROOT / "manifest.json"
DEFAULT_OUT = BENCH_ROOT / "out"
ENGINES_DIR = BENCH_ROOT / "engines"


def discover_engines() -> list[str]:
    """Engine names = module stems in engines/, minus the shared contract."""
    return sorted(
        p.stem
        for p in ENGINES_DIR.glob("*.py")
        if not p.stem.startswith("_") and p.stem != "base"
    )


def load_engine(name: str) -> CutoutEngine:
    module = importlib.import_module(f"engines.{name}")
    factory = getattr(module, "create", None)
    if factory is None:
        raise RuntimeError(f"engines/{name}.py does not expose create()")
    engine = factory()
    if not isinstance(engine, CutoutEngine):
        raise RuntimeError(f"engines/{name}.py create() must return a CutoutEngine")
    return engine


def normalize_mask(mask: np.ndarray) -> np.ndarray:
    """Coerce an engine's mask to the 8-bit grayscale contract (0 / 255).

    Engines return whatever their backend produces most naturally -- bool from
    a flood fill, float32 0..1 from Vision, uint8 from ultralytics. Normalising
    centrally keeps `coverage_ratio` comparable. Shape is NOT corrected here:
    a resolution mismatch is a real finding and sanity.py must be able to see it.
    """
    if not isinstance(mask, np.ndarray):
        raise TypeError(f"engine returned {type(mask).__name__}, expected numpy.ndarray")
    if mask.ndim == 3 and mask.shape[2] == 1:
        mask = mask[:, :, 0]
    if mask.ndim != 2:
        raise ValueError(f"mask must be 2-D, got shape {mask.shape}")

    if mask.dtype == np.bool_:
        return np.where(mask, 255, 0).astype(np.uint8)
    if np.issubdtype(mask.dtype, np.floating):
        scale = 255.0 if float(np.nanmax(mask, initial=0.0)) <= 1.0 else 1.0
        mask = np.nan_to_num(mask) * scale
    return np.clip(mask, 0, 255).astype(np.uint8)


def coverage_ratio(mask: np.ndarray) -> float:
    """Foreground pixels / total pixels. Obvious failures fall out of the tails."""
    if mask.size == 0:
        return 0.0
    return round(float(np.count_nonzero(mask >= 128) / mask.size), 6)


def mask_ref(mask_file: Path) -> str:
    """How a mask is addressed in results.json.

    Relative to eval/cutout for the default output root ("out/<engine>/masks/
    <id>.png", per the agreed schema); absolute when --out points elsewhere, so
    the record always says where the file actually is.
    """
    try:
        return mask_file.resolve().relative_to(BENCH_ROOT).as_posix()
    except ValueError:
        return mask_file.resolve().as_posix()


def run_one(
    engine: CutoutEngine,
    entry: ManifestEntry,
    masks_dir: Path,
    verbose: bool,
) -> dict:
    """Run one image. Never raises -- failures land in the `error` field."""
    mask_file = masks_dir / f"{entry.id}.png"
    # Drop any mask left over from an earlier run so a failure this time cannot
    # be read as a stale success.
    mask_file.unlink(missing_ok=True)

    record: dict = {
        "id": entry.id,
        "mask": None,
        "ms": None,
        "error": None,
        "coverage_ratio": None,
    }
    try:
        mask, elapsed_ms = engine.run(entry.path)
        mask = normalize_mask(mask)
        Image.fromarray(mask, mode="L").save(mask_file, format="PNG")
        record["mask"] = mask_ref(mask_file)
        record["ms"] = round(float(elapsed_ms), 1)
        record["coverage_ratio"] = coverage_ratio(mask)
    except Exception as exc:  # noqa: BLE001 -- one bad image must not stop the run
        record["error"] = f"{type(exc).__name__}: {exc}".strip()
        if verbose:
            traceback.print_exc()
    return record


def print_summary(engine_name: str, records: list[dict], results_path: Path) -> None:
    print()
    print(f"  {'id':<10} {'ms':>9} {'coverage':>9}  note")
    print(f"  {'-' * 10} {'-' * 9} {'-' * 9}  {'-' * 40}")
    for rec in records:
        ms = "-" if rec["ms"] is None else f"{rec['ms']:.1f}"
        cov = "-" if rec["coverage_ratio"] is None else f"{rec['coverage_ratio']:.4f}"
        note = rec["error"] or "ok"
        print(f"  {rec['id']:<10} {ms:>9} {cov:>9}  {note[:60]}")

    failed = sum(1 for r in records if r["error"])
    print()
    print(
        f"  {engine_name}: {len(records) - failed}/{len(records)} succeeded, "
        f"{failed} error(s)"
    )
    print(f"  wrote {results_path}")


def main(argv: list[str] | None = None) -> int:
    available = discover_engines()
    parser = argparse.ArgumentParser(
        prog="run.py",
        description="Run one cutout engine over a manifest of flat-lay images.",
    )
    parser.add_argument(
        "--engine",
        required=True,
        choices=available,
        help="engine module under eval/cutout/engines/",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help=f"path to manifest.json (default: {DEFAULT_MANIFEST})",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"output root (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="print a full traceback for each failing image",
    )
    args = parser.parse_args(argv)

    try:
        entries = load_manifest(args.manifest)
    except ManifestError as exc:
        print(f"manifest validation failed:\n{exc}", file=sys.stderr)
        return 2

    engine_dir = args.out / args.engine
    masks_dir = engine_dir / "masks"
    masks_dir.mkdir(parents=True, exist_ok=True)

    print(f"engine   : {args.engine}")
    print(f"manifest : {args.manifest} ({len(entries)} image(s))")

    try:
        engine = load_engine(args.engine)
    except Exception as exc:  # noqa: BLE001 -- setup failure is fatal, but reportable
        print(f"engine setup failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        if args.verbose:
            traceback.print_exc()
        return 1

    try:
        records = [
            run_one(engine, entry, masks_dir, args.verbose)
            for entry in entries
        ]
    finally:
        engine.close()

    payload = {
        "engine": args.engine,
        "run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "env": {
            "os": f"{platform.system()} {platform.mac_ver()[0] or platform.release()} "
            f"({platform.machine()})",
            "device": engine.device,
            "model_version": engine.model_version,
        },
        "results": records,
    }
    results_path = engine_dir / "results.json"
    results_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print_summary(args.engine, records, results_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
