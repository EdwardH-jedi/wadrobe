"""PNG -> proxy-3D GLB generation pipeline (Track B2 feasibility spike).

Honesty contract: this produces a PROXY 3D artifact — a lightly extruded
silhouette slab (or a flat textured plane when there is no usable alpha
mask) with the uploaded PNG as its texture. It is NOT real virtual try-on,
NOT garment reconstruction, and NOT simulation-ready clothing. Keep every
user-facing string in this module consistent with that.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app import config
from app.proxy3d import meshbuild

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

LIMITATIONS_TEXT = (
    "Proxy 3D preview only. This image-to-3D proxy is a lightly extruded "
    "silhouette card (or a flat textured plane when the PNG has no "
    "transparency) generated from the uploaded image. It is not real "
    "virtual try-on, not accurate garment geometry, and not a fit or size "
    "estimate."
)

METHOD_EXTRUDED = "extruded-alpha-contour"
METHOD_PLANE = "textured-plane"


class Proxy3dError(Exception):
    """Validation/processing failure mapped to an HTTP error by the API."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class GenerationResult:
    glb_bytes: bytes
    method: str
    alpha_mask_used: bool
    input_width: int
    input_height: int
    input_has_alpha: bool
    vertex_count: int
    face_count: int
    limitations: str


def validate_upload(data: bytes) -> None:
    if not data:
        raise Proxy3dError(422, "Empty upload — send a PNG image file.")
    if len(data) > config.MAX_UPLOAD_BYTES:
        limit_mb = config.MAX_UPLOAD_BYTES / (1024 * 1024)
        raise Proxy3dError(
            413, f"File too large — the limit for this spike is {limit_mb:.1f} MB."
        )
    if not data.startswith(PNG_MAGIC):
        raise Proxy3dError(
            415,
            "Only PNG images are supported by this spike. "
            "A transparent-background PNG gives the best proxy result.",
        )


def load_png(data: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(data))
        width, height = img.size
    except Image.DecompressionBombError as exc:  # pragma: no cover - belt & braces
        raise Proxy3dError(422, "Image is too large to process safely.") from exc
    except Exception as exc:
        raise Proxy3dError(422, "Could not read the PNG — the file looks corrupt.") from exc

    if img.format != "PNG":
        raise Proxy3dError(415, "Only PNG images are supported by this spike.")
    if width > config.MAX_IMAGE_EDGE or height > config.MAX_IMAGE_EDGE:
        raise Proxy3dError(
            422,
            f"Image dimensions {width}x{height} exceed the "
            f"{config.MAX_IMAGE_EDGE}px limit for this spike.",
        )
    if width < config.MIN_IMAGE_EDGE or height < config.MIN_IMAGE_EDGE:
        raise Proxy3dError(
            422, f"Image is too small — each edge must be at least {config.MIN_IMAGE_EDGE}px."
        )

    try:
        img.load()
    except Exception as exc:
        raise Proxy3dError(
            422, "Could not decode the PNG — the file looks corrupt or truncated."
        ) from exc
    return img


def usable_alpha_mask(rgba: Image.Image) -> np.ndarray | None:
    """Boolean (rows, cols) mask of garment pixels, or None if effectively opaque.

    Raises if the image is (almost) fully transparent — there is nothing to
    build a proxy from.
    """
    alpha = np.asarray(rgba.getchannel("A"), dtype=np.uint8)
    if int(alpha.min()) >= config.OPAQUE_ALPHA_MIN:
        return None
    mask = alpha >= config.ALPHA_SOLID_THRESHOLD
    if not mask.any():
        raise Proxy3dError(
            422,
            "The PNG is fully transparent — there is no visible garment to "
            "build a proxy from.",
        )
    return mask


def mask_to_grid(mask: np.ndarray) -> np.ndarray:
    """Downsample the pixel mask to the silhouette cell grid (area-averaged)."""
    rows, cols = mask.shape
    longer = max(rows, cols)
    grid_rows = max(1, round(config.GRID_LONG_EDGE * rows / longer))
    grid_cols = max(1, round(config.GRID_LONG_EDGE * cols / longer))
    mask_img = Image.fromarray((mask.astype(np.uint8)) * 255, mode="L")
    resized = mask_img.resize((grid_cols, grid_rows), Image.Resampling.BOX)
    return np.asarray(resized, dtype=np.uint8) >= 128


def prepare_texture(rgba: Image.Image) -> Image.Image:
    """Downscale the RGBA image so the embedded GLB texture stays small."""
    texture = rgba.copy()
    texture.thumbnail(
        (config.TEXTURE_MAX_EDGE, config.TEXTURE_MAX_EDGE), Image.Resampling.LANCZOS
    )
    return texture


def generate(data: bytes) -> GenerationResult:
    validate_upload(data)
    img = load_png(data)

    bands = img.getbands()
    input_has_alpha = "A" in bands or "transparency" in img.info
    rgba = img.convert("RGBA")
    width, height = rgba.size

    mask = usable_alpha_mask(rgba)
    texture = prepare_texture(rgba)

    if mask is not None:
        grid = mask_to_grid(mask)
        if not grid.any():
            raise Proxy3dError(
                422,
                "The visible area of the PNG is too small to build a proxy "
                "silhouette from.",
            )
        mesh = meshbuild.build_extruded_mesh(grid, width, height)
        method = METHOD_EXTRUDED
        alpha_mask_used = True
    else:
        mesh = meshbuild.build_plane(width, height)
        method = METHOD_PLANE
        alpha_mask_used = False

    glb_bytes = meshbuild.export_glb(mesh, texture, alpha_mask=alpha_mask_used)
    if not glb_bytes or not glb_bytes.startswith(b"glTF"):
        raise Proxy3dError(500, "GLB export produced an invalid file.")

    return GenerationResult(
        glb_bytes=glb_bytes,
        method=method,
        alpha_mask_used=alpha_mask_used,
        input_width=width,
        input_height=height,
        input_has_alpha=input_has_alpha,
        vertex_count=int(len(mesh.vertices)),
        face_count=int(len(mesh.faces)),
        limitations=LIMITATIONS_TEXT,
    )
