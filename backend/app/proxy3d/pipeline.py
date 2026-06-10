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

DUAL_LIMITATIONS_SUFFIX = (
    " The back image is projected onto the front image's silhouette and "
    "aligned only by bounding box — front/back outlines are not matched "
    "precisely."
)

DUAL_MANUAL_LIMITATIONS_SUFFIX = (
    " The back image is projected onto the front image's silhouette with "
    "manually adjusted scale/offset — the alignment is user-tuned but still "
    "approximate, and it is not a fit estimate or real garment "
    "reconstruction."
)

# Manual back-alignment bounds (normalized units; clamped, never rejected).
BACK_SCALE_MIN, BACK_SCALE_MAX = 0.25, 4.0
BACK_OFFSET_LIMIT = 0.5  # fraction of the front texture's width/height

METHOD_EXTRUDED = "extruded-alpha-contour"
METHOD_EXTRUDED_DUAL = "extruded-alpha-contour-dual"
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
    sides: str = "single"  # 'single' | 'dual'
    back_width: int | None = None
    back_height: int | None = None
    back_has_alpha: bool | None = None
    back_alpha_mask_used: bool | None = None
    # Applied (post-clamp) manual back alignment; None on single-sided.
    back_align_scale: float | None = None
    back_align_offset_x: float | None = None
    back_align_offset_y: float | None = None
    back_align_manual: bool | None = None


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


def _mask_bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """(left, top, right, bottom) of the solid region, exclusive right/bottom."""
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any() or not cols.any():
        return None
    top, bottom = int(np.argmax(rows)), int(len(rows) - np.argmax(rows[::-1]))
    left, right = int(np.argmax(cols)), int(len(cols) - np.argmax(cols[::-1]))
    return (left, top, right, bottom)


def clamp_back_alignment(
    scale: float, offset_x: float, offset_y: float
) -> tuple[float, float, float]:
    """Clamp manual alignment values into safe normalized ranges."""

    def _num(value: float, fallback: float) -> float:
        return float(value) if np.isfinite(value) else fallback

    scale = min(BACK_SCALE_MAX, max(BACK_SCALE_MIN, _num(scale, 1.0)))
    offset_x = min(BACK_OFFSET_LIMIT, max(-BACK_OFFSET_LIMIT, _num(offset_x, 0.0)))
    offset_y = min(BACK_OFFSET_LIMIT, max(-BACK_OFFSET_LIMIT, _num(offset_y, 0.0)))
    return scale, offset_x, offset_y


def build_aligned_back_texture(
    front_texture: Image.Image,
    front_mask: np.ndarray,
    front_size: tuple[int, int],
    back_rgba: Image.Image,
    back_mask: np.ndarray | None,
    scale_mult: float = 1.0,
    offset_x_frac: float = 0.0,
    offset_y_frac: float = 0.0,
) -> Image.Image:
    """Normalize the back image onto a canvas matching the front texture.

    Deterministic bounding-box alignment: the back's content (its alpha bbox,
    or the whole image when opaque) is scaled uniformly so its height matches
    the front silhouette's bbox height (clamped to the canvas width), then
    pasted centered on the front bbox center. Manual adjustments (B3.8) are
    applied on top: `scale_mult` multiplies the bbox-fit scale and the
    offsets shift the paste position by a fraction of the canvas size. No
    outline matching — honest proxy alignment only.
    """
    canvas = Image.new("RGBA", front_texture.size, (0, 0, 0, 0))
    tex_w, tex_h = front_texture.size
    orig_w, orig_h = front_size
    scale_x = tex_w / orig_w
    scale_y = tex_h / orig_h

    fb = _mask_bbox(front_mask)
    if fb is None:  # cannot happen on the extruded path; keep a safe default
        fb = (0, 0, orig_w, orig_h)
    # Front bbox in texture coordinates.
    f_left, f_top = fb[0] * scale_x, fb[1] * scale_y
    f_right, f_bottom = fb[2] * scale_x, fb[3] * scale_y
    f_height = max(1.0, f_bottom - f_top)
    f_cx = (f_left + f_right) / 2.0
    f_cy = (f_top + f_bottom) / 2.0

    if back_mask is not None:
        bb = _mask_bbox(back_mask)
    else:
        bb = None
    if bb is None:
        bb = (0, 0, back_rgba.size[0], back_rgba.size[1])
    crop = back_rgba.crop(bb)
    crop_w, crop_h = max(1, crop.size[0]), max(1, crop.size[1])

    scale = f_height / crop_h
    # Avoid spilling far past the canvas if the back crop is very wide —
    # only for the automatic fit; a manual scale_mult may exceed on purpose
    # (the paste simply clips at the canvas edges).
    scale = min(scale, tex_w / crop_w)
    scale *= scale_mult
    new_w = max(1, round(crop_w * scale))
    new_h = max(1, round(crop_h * scale))
    resized = crop.resize((new_w, new_h), Image.Resampling.LANCZOS)

    paste_x = round(f_cx - new_w / 2.0 + offset_x_frac * tex_w)
    paste_y = round(f_cy - new_h / 2.0 + offset_y_frac * tex_h)
    canvas.paste(resized, (paste_x, paste_y), resized)
    return canvas


def _decode_back(back_data: bytes) -> tuple[Image.Image, bool]:
    """Validate + decode the back image; errors are prefixed so the user
    knows which side failed."""
    try:
        validate_upload(back_data)
        img = load_png(back_data)
    except Proxy3dError as exc:
        raise Proxy3dError(exc.status_code, f"Back image: {exc.detail}") from exc
    bands = img.getbands()
    has_alpha = "A" in bands or "transparency" in img.info
    return img.convert("RGBA"), has_alpha


def generate(
    data: bytes,
    back_data: bytes | None = None,
    back_scale: float = 1.0,
    back_offset_x: float = 0.0,
    back_offset_y: float = 0.0,
) -> GenerationResult:
    validate_upload(data)
    img = load_png(data)

    bands = img.getbands()
    input_has_alpha = "A" in bands or "transparency" in img.info
    rgba = img.convert("RGBA")
    width, height = rgba.size

    mask = usable_alpha_mask(rgba)
    texture = prepare_texture(rgba)

    sides = "single"
    back_width: int | None = None
    back_height: int | None = None
    back_has_alpha: bool | None = None
    back_alpha_mask_used: bool | None = None
    limitations = LIMITATIONS_TEXT
    align_scale: float | None = None
    align_offset_x: float | None = None
    align_offset_y: float | None = None
    align_manual: bool | None = None

    if mask is not None:
        grid = mask_to_grid(mask)
        if not grid.any():
            raise Proxy3dError(
                422,
                "The visible area of the PNG is too small to build a proxy "
                "silhouette from.",
            )
        if back_data is not None:
            back_rgba, back_has_alpha = _decode_back(back_data)
            back_width, back_height = back_rgba.size
            try:
                back_mask = usable_alpha_mask(back_rgba)
            except Proxy3dError as exc:
                raise Proxy3dError(
                    exc.status_code, f"Back image: {exc.detail}"
                ) from exc
            back_alpha_mask_used = back_mask is not None
            align_scale, align_offset_x, align_offset_y = clamp_back_alignment(
                back_scale, back_offset_x, back_offset_y
            )
            align_manual = (
                align_scale != 1.0
                or align_offset_x != 0.0
                or align_offset_y != 0.0
            )
            back_texture = build_aligned_back_texture(
                texture,
                mask,
                (width, height),
                back_rgba,
                back_mask,
                scale_mult=align_scale,
                offset_x_frac=align_offset_x,
                offset_y_frac=align_offset_y,
            )
            parts = meshbuild.build_extruded_parts(grid, width, height)
            glb_bytes = meshbuild.export_dual_glb(
                parts, texture, back_texture, alpha_mask=True
            )
            method = METHOD_EXTRUDED_DUAL
            alpha_mask_used = True
            sides = "dual"
            limitations = LIMITATIONS_TEXT + (
                DUAL_MANUAL_LIMITATIONS_SUFFIX
                if align_manual
                else DUAL_LIMITATIONS_SUFFIX
            )
            vertex_count = sum(len(p.vertices) for p in parts.values())
            face_count = sum(len(p.faces) for p in parts.values())
        else:
            mesh = meshbuild.build_extruded_mesh(grid, width, height)
            glb_bytes = meshbuild.export_glb(mesh, texture, alpha_mask=True)
            method = METHOD_EXTRUDED
            alpha_mask_used = True
            vertex_count = int(len(mesh.vertices))
            face_count = int(len(mesh.faces))
    else:
        # No usable front alpha -> honest flat card (single-sided by
        # definition; any back image is ignored — the UI gates this path
        # behind an explicit choice).
        mesh = meshbuild.build_plane(width, height)
        glb_bytes = meshbuild.export_glb(mesh, texture, alpha_mask=False)
        method = METHOD_PLANE
        alpha_mask_used = False
        vertex_count = int(len(mesh.vertices))
        face_count = int(len(mesh.faces))

    if not glb_bytes or not glb_bytes.startswith(b"glTF"):
        raise Proxy3dError(500, "GLB export produced an invalid file.")

    return GenerationResult(
        glb_bytes=glb_bytes,
        method=method,
        alpha_mask_used=alpha_mask_used,
        input_width=width,
        input_height=height,
        input_has_alpha=input_has_alpha,
        vertex_count=vertex_count,
        face_count=face_count,
        limitations=limitations,
        sides=sides,
        back_width=back_width,
        back_height=back_height,
        back_has_alpha=back_has_alpha,
        back_alpha_mask_used=back_alpha_mask_used,
        back_align_scale=align_scale,
        back_align_offset_x=align_offset_x,
        back_align_offset_y=align_offset_y,
        back_align_manual=align_manual,
    )
