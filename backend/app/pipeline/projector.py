"""Planar garment texture projector (Track B, Phase B5b).

An honest texture PROXY: it decodes the uploaded garment photo and shines it
onto the mannequin's torso and leg primitives as a flat, front-facing planar
map — a slide projector aimed at the body from +Z. Each vertex's UV is just its
world X/Y position inside the region's bounding box. There is NO garment
reconstruction, NO seam/pattern layout, NO tailored-garment UV unwrap, and NO
fit or size estimate. Because the map is planar, the photo wraps around each
primitive: the sides and back of a cylinder repeat the front image smeared
along X. That is what a projection does, and the notes say so.

No ML, no cloud: only trimesh + numpy + pillow, the same budget as
``mannequin.py`` / ``fitter.py``. It implements the existing
``ITextureProjector`` Protocol, so the runner swaps it in without any other
change.

Honesty edge cases (mirroring ``fitter.py``):
  * No garment image supplied -> return the mesh unchanged (an untextured
    mannequin is a normal result, not an error).
  * An image supplied but undecodable -> raise, so the job lifecycle marks the
    job FAILED with an honest error. We never silently drop a requested texture
    and let the result pass as textured.
"""

from __future__ import annotations

import io

import numpy as np
import trimesh
from PIL import Image

from app import config
from app.pipeline.interfaces import AvatarInputs, AvatarMesh

# Region heuristic, expressed in fractions of the mesh's OWN bounding box: a
# part counts as torso/leg when its center sits below the head/neck band and
# close enough to the mid-line not to be an arm. Written against the B4b
# mannequin layout (head 0.93, neck 0.84, torso 0.66, arms 0.64 at |x| ~0.74 of
# the half-span, legs 0.25 at ~0.31) but relative to the mesh, so another
# builder still lands somewhere sensible — a single box selects itself.
_HEAD_BAND = 0.80  # center height fraction above which a part is head/neck
_ARM_OFFSET = 0.50  # |x| center fraction beyond which a part is an arm

# Transparent garment pixels are flattened onto this neutral grey: the photo
# lands on solid primitives, so an alpha hole would show straight through the
# body instead of cutting the garment to shape.
_TEXTURE_BACKGROUND = (170, 170, 174)
_EPS = 1e-9


def _decode_garment(data: bytes) -> Image.Image:
    """Decode the garment photo into an opaque, size-capped RGB texture.

    Raises (never returns a placeholder) when the bytes are not a usable image.
    """
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception as exc:  # not an image / truncated / corrupt / too large
        raise ValueError(f"Could not decode the garment image: {exc}") from exc

    if image.width < 1 or image.height < 1:
        raise ValueError("The garment image has no pixels.")

    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        flattened = Image.new("RGB", rgba.size, _TEXTURE_BACKGROUND)
        flattened.paste(rgba, mask=rgba.getchannel("A"))
        image = flattened
    else:
        image = image.convert("RGB")

    longest = max(image.size)
    if longest > config.TEXTURE_MAX_EDGE:
        scale = config.TEXTURE_MAX_EDGE / longest
        image = image.resize(
            (
                max(1, round(image.width * scale)),
                max(1, round(image.height * scale)),
            ),
            Image.LANCZOS,
        )
    return image


def _world_vertices(scene: trimesh.Scene) -> dict[str, np.ndarray]:
    """World-space vertices per geometry name, with node transforms applied.

    The procedural builder places its primitives directly (identity nodes), but
    resolving the graph keeps the region maths consistent with ``scene.bounds``
    for any builder that does use transforms.
    """
    matrices: dict[str, np.ndarray] = {}
    for node in scene.graph.nodes_geometry:
        matrix, geom_name = scene.graph[node]
        matrices.setdefault(geom_name, np.asarray(matrix, dtype=np.float64))

    world: dict[str, np.ndarray] = {}
    for name, geom in scene.geometry.items():
        vertices = np.asarray(geom.vertices, dtype=np.float64)
        matrix = matrices.get(name)
        if matrix is None or vertices.shape[0] == 0:
            world[name] = vertices
        else:
            world[name] = trimesh.transform_points(vertices, matrix)
    return world


def _select_region(
    scene: trimesh.Scene, world: dict[str, np.ndarray]
) -> tuple[list[str], bool]:
    """Pick the torso/leg geometries. Returns (names, used_fallback).

    The fallback (every geometry) fires only when the heuristic matches nothing
    — better an honestly-noted whole-mesh projection than a silently untextured
    result.
    """
    low, high = scene.bounds
    height = high[1] - low[1]
    x_center = (low[0] + high[0]) / 2.0
    x_half = (high[0] - low[0]) / 2.0

    populated = [name for name, verts in world.items() if verts.shape[0] > 0]
    if height <= _EPS:  # degenerate/flat mesh: nothing to classify
        return populated, True

    selected: list[str] = []
    for name in populated:
        verts = world[name]
        center = (verts.min(axis=0) + verts.max(axis=0)) / 2.0
        height_fraction = (center[1] - low[1]) / height
        offset_fraction = (
            abs(center[0] - x_center) / x_half if x_half > _EPS else 0.0
        )
        if height_fraction > _HEAD_BAND or offset_fraction > _ARM_OFFSET:
            continue  # head / neck / arm
        selected.append(name)

    return (selected, False) if selected else (populated, True)


def _planar_uv(
    points: np.ndarray, low: np.ndarray, high: np.ndarray
) -> np.ndarray:
    """Front-facing planar UV: world X -> u, world Y -> v, over the region box.

    Lower-left-origin UV, the convention trimesh stores and its glTF exporter
    flips — so the photo's top row lands at the top of the region (shoulders).
    """
    span = high - low
    count = points.shape[0]
    u = (
        (points[:, 0] - low[0]) / span[0]
        if span[0] > _EPS
        else np.full(count, 0.5)
    )
    v = (
        (points[:, 1] - low[1]) / span[1]
        if span[1] > _EPS
        else np.full(count, 0.5)
    )
    return np.column_stack([u, v])


class PlanarGarmentTextureProjector:
    """Project the garment photo onto the torso + leg primitives (B5b).

    Planar projection onto primitive geometry — not garment reconstruction, not
    real texturing of a tailored garment, and not a fit estimate.
    """

    def project(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh:
        if inputs.face_image is not None:
            # Unchanged from B4a: this track does no face reconstruction.
            mesh.notes.append(
                "face-texture: not applied (no face reconstruction)"
            )

        if not inputs.body_image:
            return mesh  # untextured mannequin — normal result, not an error

        texture = _decode_garment(inputs.body_image)

        scene = mesh.scene
        world = _world_vertices(scene)
        names, used_fallback = _select_region(scene, world)
        if not names:
            raise ValueError("The mesh has no geometry to project a garment onto.")

        region = np.vstack([world[name] for name in names])
        low, high = region.min(axis=0), region.max(axis=0)

        # One shared material, so the GLB embeds the photo exactly once.
        material = trimesh.visual.material.PBRMaterial(
            name="garment-planar-projection",
            baseColorTexture=texture,
            metallicFactor=0.0,
            roughnessFactor=0.9,
            doubleSided=True,
        )
        for name in names:
            scene.geometry[name].visual = trimesh.visual.TextureVisuals(
                uv=_planar_uv(world[name], low, high), material=material
            )

        region_text = (
            "the whole mesh (no torso/leg region matched)"
            if used_fallback
            else f"{len(names)} torso/leg primitives"
        )
        mesh.notes.append(
            f"garment-texture: planar photo projection onto {region_text} "
            "(B5b) — not garment reconstruction, not a fit estimate"
        )
        return mesh
