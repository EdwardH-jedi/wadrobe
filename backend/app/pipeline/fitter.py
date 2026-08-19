"""Bounding-box outfit fitter (Track B, Phase B5a).

An honest outfit PROXY: it loads a user-supplied outfit GLB and places it on the
mannequin by **bounding box only** — a uniform scale + a centering translation so
the garment spans a sensible fraction of the body and visibly wraps it. There is
NO cloth simulation, NO rigging/skinning, NO semantic top/bottom split, and NO
real garment fit — just a bbox align. Both meshes coexist in one Scene and export
to a single GLB.

Honesty edge cases:
  * No outfit supplied -> return the mannequin unchanged (mannequin-only is a
    normal result, not an error).
  * Outfit supplied but unloadable/empty -> raise, so the job lifecycle marks the
    job FAILED with an honest error. We never silently drop a requested outfit and
    pretend it was fitted.
"""

from __future__ import annotations

import io

import numpy as np
import trimesh

from app.pipeline.interfaces import AvatarInputs, AvatarMesh

# The outfit is scaled to this fraction of the mannequin's tightest axis, then a
# hair looser, so it sits just proud of the body (visible wrap, not z-fighting).
_TARGET_FRACTION = 0.92
_LOOSEN = 1.06
_EPS = 1e-9


class BboxOutfitFitter:
    """Merge an outfit GLB onto the mannequin by bounding-box alignment (B5a)."""

    def fit(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh:
        if inputs.outfit_glb is None:
            return mesh  # mannequin-only — a normal result, not an error

        outfit = self._load_outfit(inputs.outfit_glb)
        self._bbox_align(mesh.scene, outfit)
        mesh.scene.add_geometry(outfit, geom_name="outfit")
        mesh.notes.append("outfit-fit: bbox-align (B5a)")
        return mesh

    @staticmethod
    def _load_outfit(data: bytes) -> trimesh.Trimesh:
        """Load + normalize the outfit GLB to one Trimesh. Raises (never returns
        a bare mannequin) when the bytes are not a usable GLB."""
        try:
            loaded = trimesh.load(io.BytesIO(data), file_type="glb")
        except Exception as exc:  # malformed / truncated / not a GLB
            raise ValueError(f"Could not load the outfit GLB: {exc}") from exc

        if isinstance(loaded, trimesh.Scene):
            # `Scene.to_geometry()` is the supported replacement for
            # `Scene.dump(concatenate=True)`, which trimesh marked
            # "DEPRECATED FOR REMOVAL APRIL 2025". As of trimesh 5.0.0 `dump`
            # still works and still warns; this is the forward-compatible call.
            # Both concatenate the scene's geometry into a single mesh.
            geom = loaded.to_geometry() if len(loaded.geometry) else None
        elif isinstance(loaded, trimesh.Trimesh):
            geom = loaded
        else:
            geom = None

        if not isinstance(geom, trimesh.Trimesh) or geom.vertices.shape[0] == 0:
            raise ValueError("The outfit GLB contained no usable geometry.")
        return geom

    @staticmethod
    def _bbox_align(scene: trimesh.Scene, outfit: trimesh.Trimesh) -> None:
        """Uniform scale + centering so the outfit fits the mannequin bbox. The
        scale is the tightest per-axis ratio, so no axis ever explodes past the
        body; centering puts the garment over the torso. Mutates ``outfit``."""
        body_min, body_max = scene.bounds
        body_extents = body_max - body_min
        body_center = (body_min + body_max) / 2.0

        outfit_extents = outfit.extents
        ratios = [
            body_extents[i] / outfit_extents[i]
            for i in range(3)
            if outfit_extents[i] > _EPS
        ]
        if not ratios:
            raise ValueError("The outfit GLB has a degenerate bounding box.")
        scale = _TARGET_FRACTION * _LOOSEN * min(ratios)

        outfit.apply_scale(scale)
        scaled_center = outfit.bounds.mean(axis=0)
        outfit.apply_translation(np.asarray(body_center) - scaled_center)
