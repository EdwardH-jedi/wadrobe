"""Proxy mesh construction: textured plane and extruded silhouette slab.

Both builders produce plain numpy arrays (vertices, faces, per-vertex UV)
plus a trimesh-based GLB export. This is deliberately classic geometry —
no ML, no reconstruction. The extruded mesh is a grid-quad slab: front and
back layers offset in Z where the alpha-mask grid is solid, with side walls
along exposed cell edges.

World units: the longer image edge maps to 1.0, centered at the origin,
image-up = +Y, viewer side = +Z.

UV convention: trimesh stores UVs with the origin at the LOWER-left (OBJ
style) and its glTF exporter flips V, so glTF output lands in the spec's
upper-left-origin convention. We therefore emit lower-left-origin UVs here.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
import trimesh
from PIL import Image

from app import config


@dataclass
class ProxyMesh:
    vertices: np.ndarray  # (n, 3) float64
    faces: np.ndarray  # (m, 3) int64
    uv: np.ndarray | None  # (n, 2) float64, lower-left origin; None = untextured


def _world_dims(width_px: int, height_px: int) -> tuple[float, float]:
    """Map pixel dimensions to world dimensions with the longer edge = 1.0."""
    longer = max(width_px, height_px)
    return width_px / longer, height_px / longer


def build_plane(width_px: int, height_px: int) -> ProxyMesh:
    """A single textured quad showing the full image (no silhouette cut)."""
    w, h = _world_dims(width_px, height_px)
    hw, hh = w / 2.0, h / 2.0
    # Corners: top-left, top-right, bottom-left, bottom-right (image space).
    vertices = np.array(
        [
            [-hw, hh, 0.0],
            [hw, hh, 0.0],
            [-hw, -hh, 0.0],
            [hw, -hh, 0.0],
        ],
        dtype=np.float64,
    )
    # Lower-left-origin UV: image top row has v=1.
    uv = np.array([[0.0, 1.0], [1.0, 1.0], [0.0, 0.0], [1.0, 0.0]])
    # CCW seen from +Z (the textured front).
    faces = np.array([[0, 2, 3], [0, 3, 1]], dtype=np.int64)
    return ProxyMesh(vertices=vertices, faces=faces, uv=uv)


def build_extruded_mesh(grid: np.ndarray, width_px: int, height_px: int) -> ProxyMesh:
    """Extrude the solid cells of a boolean (rows, cols) grid into a slab.

    Front (+Z) and back (-Z) faces are emitted per solid cell; a wall quad is
    emitted along every cell edge that borders a non-solid cell or the grid
    boundary, wound so normals point outward.
    """
    if grid.ndim != 2 or grid.dtype != np.bool_:
        raise ValueError("grid must be a 2D boolean array")
    if not grid.any():
        raise ValueError("grid has no solid cells")

    rows, cols = grid.shape
    w, h = _world_dims(width_px, height_px)
    half_depth = config.EXTRUDE_DEPTH_RATIO / 2.0

    vertex_index: dict[tuple[int, int, int], int] = {}
    positions: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    faces: list[tuple[int, int, int]] = []

    def corner(r: int, c: int, layer: int) -> int:
        """Index of the grid-corner vertex (r, c) on layer +1 (front) / -1 (back)."""
        key = (r, c, layer)
        idx = vertex_index.get(key)
        if idx is None:
            x = (c / cols - 0.5) * w
            y = (0.5 - r / rows) * h
            z = half_depth * layer
            idx = len(positions)
            vertex_index[key] = idx
            positions.append((x, y, z))
            # Lower-left-origin UV: top row (r=0) maps to v=1.
            uvs.append((c / cols, 1.0 - r / rows))
        return idx

    def solid(r: int, c: int) -> bool:
        return 0 <= r < rows and 0 <= c < cols and bool(grid[r, c])

    for r in range(rows):
        for c in range(cols):
            if not grid[r, c]:
                continue
            f_tl = corner(r, c, 1)
            f_tr = corner(r, c + 1, 1)
            f_bl = corner(r + 1, c, 1)
            f_br = corner(r + 1, c + 1, 1)
            b_tl = corner(r, c, -1)
            b_tr = corner(r, c + 1, -1)
            b_bl = corner(r + 1, c, -1)
            b_br = corner(r + 1, c + 1, -1)

            # Front face, CCW seen from +Z.
            faces.append((f_tl, f_bl, f_br))
            faces.append((f_tl, f_br, f_tr))
            # Back face, CCW seen from -Z.
            faces.append((b_tl, b_br, b_bl))
            faces.append((b_tl, b_tr, b_br))

            # Walls along exposed edges. For an edge walked front-corner
            # a -> b, the outward normal is (b - a) x (0, 0, -1); each
            # direction below picks (a, b) so that points away from the cell.
            walls = (
                (not solid(r - 1, c), f_tl, f_tr, b_tl, b_tr),  # top, outward +Y
                (not solid(r + 1, c), f_br, f_bl, b_br, b_bl),  # bottom, outward -Y
                (not solid(r, c - 1), f_bl, f_tl, b_bl, b_tl),  # left, outward -X
                (not solid(r, c + 1), f_tr, f_br, b_tr, b_br),  # right, outward +X
            )
            for exposed, a_f, b_f, a_b, b_b in walls:
                if exposed:
                    faces.append((a_f, b_f, b_b))
                    faces.append((a_f, b_b, a_b))

    return ProxyMesh(
        vertices=np.array(positions, dtype=np.float64),
        faces=np.array(faces, dtype=np.int64),
        uv=np.array(uvs, dtype=np.float64),
    )


def build_extruded_parts(
    grid: np.ndarray, width_px: int, height_px: int
) -> dict[str, ProxyMesh]:
    """Like build_extruded_mesh, but split into three parts so each can carry
    its own material: 'front' (+Z faces, front-image UVs), 'back' (-Z faces,
    horizontally flipped UVs so the back photo reads correctly when viewed
    from behind), and 'walls' (untextured side quads).
    """
    if grid.ndim != 2 or grid.dtype != np.bool_:
        raise ValueError("grid must be a 2D boolean array")
    if not grid.any():
        raise ValueError("grid has no solid cells")

    rows, cols = grid.shape
    w, h = _world_dims(width_px, height_px)
    half_depth = config.EXTRUDE_DEPTH_RATIO / 2.0

    def position(r: int, c: int, layer: int) -> tuple[float, float, float]:
        return (
            (c / cols - 0.5) * w,
            (0.5 - r / rows) * h,
            half_depth * layer,
        )

    def uv_front(r: int, c: int) -> tuple[float, float]:
        return (c / cols, 1.0 - r / rows)

    def uv_back(r: int, c: int) -> tuple[float, float]:
        # Mirrored U: viewed from -Z, world +X is on the viewer's left, so
        # the back image's left edge (u=0) must land there.
        return (1.0 - c / cols, 1.0 - r / rows)

    class Part:
        def __init__(self, uv_fn) -> None:
            self.uv_fn = uv_fn
            self.index: dict[tuple[int, int, int], int] = {}
            self.positions: list[tuple[float, float, float]] = []
            self.uvs: list[tuple[float, float]] = []
            self.faces: list[tuple[int, int, int]] = []

        def corner(self, r: int, c: int, layer: int) -> int:
            key = (r, c, layer)
            idx = self.index.get(key)
            if idx is None:
                idx = len(self.positions)
                self.index[key] = idx
                self.positions.append(position(r, c, layer))
                if self.uv_fn is not None:
                    self.uvs.append(self.uv_fn(r, c))
            return idx

        def face(self, a: int, b: int, c_: int) -> None:
            self.faces.append((a, b, c_))

        def mesh(self) -> ProxyMesh:
            return ProxyMesh(
                vertices=np.array(self.positions, dtype=np.float64),
                faces=np.array(self.faces, dtype=np.int64),
                uv=(
                    np.array(self.uvs, dtype=np.float64)
                    if self.uv_fn is not None
                    else None
                ),
            )

    front = Part(uv_front)
    back = Part(uv_back)
    walls = Part(None)

    def solid(r: int, c: int) -> bool:
        return 0 <= r < rows and 0 <= c < cols and bool(grid[r, c])

    for r in range(rows):
        for c in range(cols):
            if not grid[r, c]:
                continue
            # Front face, CCW seen from +Z.
            f_tl = front.corner(r, c, 1)
            f_tr = front.corner(r, c + 1, 1)
            f_bl = front.corner(r + 1, c, 1)
            f_br = front.corner(r + 1, c + 1, 1)
            front.face(f_tl, f_bl, f_br)
            front.face(f_tl, f_br, f_tr)

            # Back face, CCW seen from -Z.
            b_tl = back.corner(r, c, -1)
            b_tr = back.corner(r, c + 1, -1)
            b_bl = back.corner(r + 1, c, -1)
            b_br = back.corner(r + 1, c + 1, -1)
            back.face(b_tl, b_br, b_bl)
            back.face(b_tl, b_tr, b_br)

            # Walls along exposed edges — same winding rules as the single
            # mesh builder (outward normals).
            w_f_tl = walls.corner(r, c, 1)
            w_f_tr = walls.corner(r, c + 1, 1)
            w_f_bl = walls.corner(r + 1, c, 1)
            w_f_br = walls.corner(r + 1, c + 1, 1)
            w_b_tl = walls.corner(r, c, -1)
            w_b_tr = walls.corner(r, c + 1, -1)
            w_b_bl = walls.corner(r + 1, c, -1)
            w_b_br = walls.corner(r + 1, c + 1, -1)
            edges = (
                (not solid(r - 1, c), w_f_tl, w_f_tr, w_b_tl, w_b_tr),
                (not solid(r + 1, c), w_f_br, w_f_bl, w_b_br, w_b_bl),
                (not solid(r, c - 1), w_f_bl, w_f_tl, w_b_bl, w_b_tl),
                (not solid(r, c + 1), w_f_tr, w_f_br, w_b_tr, w_b_br),
            )
            for exposed, a_f, b_f, a_b, b_b in edges:
                if exposed:
                    walls.face(a_f, b_f, b_b)
                    walls.face(a_f, b_b, a_b)

    return {"front": front.mesh(), "back": back.mesh(), "walls": walls.mesh()}


def garment_edge_color(texture: Image.Image) -> tuple[float, float, float, float]:
    """A neutral wall color derived from the front texture: the mean of its
    opaque pixels, darkened — deterministic and unobtrusive."""
    rgba = np.asarray(texture.convert("RGBA"), dtype=np.float64)
    opaque = rgba[rgba[..., 3] >= 128]
    if opaque.size == 0:
        return (0.35, 0.35, 0.37, 1.0)
    mean = opaque[:, :3].mean(axis=0) / 255.0
    darkened = mean * 0.6
    return (float(darkened[0]), float(darkened[1]), float(darkened[2]), 1.0)


def export_glb(mesh: ProxyMesh, texture: Image.Image, alpha_mask: bool) -> bytes:
    """Export the proxy mesh with the PNG as its base-color texture."""
    material = trimesh.visual.material.PBRMaterial(
        name="proxy3d-texture",
        baseColorTexture=texture,
        metallicFactor=0.0,
        roughnessFactor=0.9,
        doubleSided=True,
        alphaMode="MASK" if alpha_mask else None,
        alphaCutoff=0.5 if alpha_mask else None,
    )
    visual = trimesh.visual.TextureVisuals(uv=mesh.uv, material=material)
    tri = trimesh.Trimesh(
        vertices=mesh.vertices, faces=mesh.faces, visual=visual, process=False
    )
    scene = trimesh.Scene(tri)
    data = scene.export(file_type="glb")
    if not isinstance(data, bytes):  # older trimesh may hand back a buffer
        buffer = io.BytesIO()
        scene.export(buffer, file_type="glb")
        data = buffer.getvalue()
    return data


def _textured_material(
    name: str, texture: Image.Image, alpha_mask: bool
) -> trimesh.visual.material.PBRMaterial:
    return trimesh.visual.material.PBRMaterial(
        name=name,
        baseColorTexture=texture,
        metallicFactor=0.0,
        roughnessFactor=0.9,
        doubleSided=True,
        alphaMode="MASK" if alpha_mask else None,
        alphaCutoff=0.5 if alpha_mask else None,
    )


def export_dual_glb(
    parts: dict[str, ProxyMesh],
    front_texture: Image.Image,
    back_texture: Image.Image,
    alpha_mask: bool,
) -> bytes:
    """Export the three-part slab: front texture on +Z faces, back texture on
    -Z faces, and an untextured neutral material on the side walls."""
    wall_color = garment_edge_color(front_texture)
    materials = {
        "front": _textured_material("proxy3d-front", front_texture, alpha_mask),
        "back": _textured_material("proxy3d-back", back_texture, alpha_mask),
        "walls": trimesh.visual.material.PBRMaterial(
            name="proxy3d-walls",
            baseColorFactor=wall_color,
            metallicFactor=0.0,
            roughnessFactor=0.95,
            doubleSided=True,
        ),
    }
    meshes = []
    for key in ("front", "back", "walls"):
        mesh = parts[key]
        visual = trimesh.visual.TextureVisuals(
            uv=mesh.uv, material=materials[key]
        )
        meshes.append(
            trimesh.Trimesh(
                vertices=mesh.vertices,
                faces=mesh.faces,
                visual=visual,
                process=False,
            )
        )
    scene = trimesh.Scene(meshes)
    data = scene.export(file_type="glb")
    if not isinstance(data, bytes):  # older trimesh may hand back a buffer
        buffer = io.BytesIO()
        scene.export(buffer, file_type="glb")
        data = buffer.getvalue()
    return data
