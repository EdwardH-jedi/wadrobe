"""Tunables for the Track B2 proxy-3D spike.

Tests monkeypatch these module attributes, so consumers must read them at
call time (``config.MAX_UPLOAD_BYTES``), never copy them at import time.
"""

# Upload validation.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_EDGE = 4096
MIN_IMAGE_EDGE = 8

# The texture embedded in the GLB is downscaled to keep results small.
TEXTURE_MAX_EDGE = 1024

# Silhouette grid resolution (cells along the longer image edge). Higher
# values follow the alpha contour more closely but grow the mesh quickly.
GRID_LONG_EDGE = 64

# Total slab thickness as a fraction of the longer world edge (which is
# normalized to 1.0). "Lightly extruded" — a card with visible depth.
EXTRUDE_DEPTH_RATIO = 0.04

# A pixel counts as garment when its alpha is at or above this value.
ALPHA_SOLID_THRESHOLD = 128

# If every alpha value is at or above this, the channel is effectively
# opaque and there is no usable silhouette mask.
OPAQUE_ALPHA_MIN = 250

# --- Avatar jobs surface (EXPERIMENTAL, unconsumed by any frontend) ----------
# Bounds rather than infrastructure: this is a research endpoint, so the goal is
# that it cannot be used to exhaust memory or disk, not that it scales.
MAX_OUTFIT_GLB_BYTES = 25 * 1024 * 1024
MAX_ACTIVE_JOBS = 4
# Generated artifacts are disposable; anything older than this is swept on the
# next job creation so the data directory cannot grow without bound.
JOB_ARTIFACT_TTL_SECONDS = 60 * 60
