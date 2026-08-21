# The Archive — experimental backend (Track B)

> **Experimental and optional.** The web app does not require this service and
> never calls it unless the build sets `VITE_ENABLE_EXPERIMENTAL_3D`. Nothing
> here is deployed anywhere; it runs on localhost.
>
> Two API surfaces live here: `/api/proxy-3d` (below), and an async
> `/api/jobs` avatar-build surface that **no frontend consumes** — see
> [`../docs/AVATAR_TRACK.md`](../docs/AVATAR_TRACK.md).

## `/api/proxy-3d` — PNG → proxy-3D GLB

A FastAPI feasibility spike for Track B (see `docs/AVATAR_TRACK.md`). It
turns a PNG garment image into an **honest proxy 3D artifact** exported as
a `.glb`:

- PNG **with transparency** → a lightly extruded silhouette slab
  (`extruded-alpha-contour`): the alpha mask is downsampled to a cell grid,
  solid cells are extruded into a thin card with side walls, and the PNG is
  applied as the base-color texture (alpha-mask cutout at render time).
- PNG **without usable transparency** → a flat textured plane
  (`textured-plane`) of the full image. No automatic segmentation is
  attempted; the response suggests uploading a transparent PNG instead.

**This is NOT real virtual try-on, garment reconstruction, or
simulation-ready clothing.** Every response carries a `limitations` string
saying so; UI copy must call it a "proxy 3D preview" / "image-to-3D proxy".

## Why synchronous (no job queue)

Generation is deterministic CPU work on a downscaled image and finishes in
well under a second, so a queue would only add states and race conditions
to a spike. The API still speaks in job terms — `POST` returns a persisted
record with a `job_id`, and the `GET` endpoints read from disk — so a
future async implementation can keep the same surface.

## Setup

From the repository root:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate       # Windows: backend\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

## Run

```bash
python -m uvicorn app.main:app --app-dir backend --port 8000
```

The Vite dev server proxies `/api` to `127.0.0.1:8000`, so with both running the
lab's requests are same-origin.

## API

| Route | Purpose |
|---|---|
| `POST /api/proxy-3d` | multipart upload (`file`, a PNG front image; optional `back_file`, a PNG back image); generates synchronously; returns the job record (201) |
| `GET /api/proxy-3d/{job_id}` | returns the persisted job record |
| `GET /api/proxy-3d/{job_id}/result.glb` | returns the GLB (`model/gltf-binary`) |

**Dual-sided (B3.7):** when `back_file` is sent and the front has a usable
alpha mask, the GLB carries three submeshes — front faces with the front
texture, back faces with the back texture (U-mirrored so it reads correctly
from behind), and side walls in a neutral color derived from the front
texture. The back image is normalized onto the front texture's canvas by
bounding-box alignment (scaled to the front silhouette's bbox height,
centered on its center — no outline matching). The record reports
`sides: "single" | "dual"`, `back_input`, and `back_alpha_mask_used`.
A front without usable alpha still produces the single-sided flat card
(any back image is ignored; the UI gates that path behind an explicit
choice).

**Manual back alignment (B3.8):** optional form fields `back_scale`
(multiplies the bbox-fit scale; clamped to 0.25–4.0), `back_offset_x` and
`back_offset_y` (fractions of the front texture's width/height; clamped to
±0.5) adjust the normalization. The record reports the applied (post-clamp)
values under `back_alignment` with a `manual` flag, and the limitations
text notes that user-tuned alignment is still approximate.

Errors: `415` non-PNG · `413` over the byte limit · `422` corrupt /
oversized / fully transparent image (back-image failures are prefixed
"Back image:") · `404` unknown job.

### curl example

```bash
# Make a sample transparent garment PNG (or use your own):
python backend/scripts/make_sample_png.py

curl -X POST -F "file=@backend/data/samples/sample-garment.png;type=image/png" \
  http://127.0.0.1:8000/api/proxy-3d
# → {"job_id":"<id>", "status":"done", "method":"extruded-alpha-contour", ...}

curl -o result.glb http://127.0.0.1:8000/api/proxy-3d/<id>/result.glb
python backend/scripts/verify_glb.py result.glb
```

Results are stored under `backend/data/proxy_3d/<job_id>/` (`result.glb` +
`metadata.json`). The data root can be overridden with the
`AVATARWARDROBE_PROXY3D_DATA` environment variable.

## Tests

```bash
python -m pytest backend      # from the repository root — 65 tests
```

The proxy-3D suite covers: transparent-PNG happy path, opaque-PNG plane fallback, GLB
container/parser validation (pygltflib + trimesh round-trip, watertight
slab), non-PNG / over-limit / oversized / fully-transparent / corrupt
rejections, server survival after errors, honest-limitations copy, and
404s for unknown job ids.

## Layout

```
backend/
  app/
    main.py              FastAPI routes + response models
    config.py            tunables (limits, grid size, extrusion depth)
    storage.py           per-job disk storage (data/proxy_3d/<job_id>/)
    proxy3d/
      pipeline.py        validate → decode → mask → mesh → GLB
      meshbuild.py       plane + extruded-slab builders, trimesh GLB export
    jobs.py              async job store for /api/jobs (in-memory state, GLB on disk)
    pipeline/
      interfaces.py      the five stage Protocols
      runner.py          composes and runs the stages
      dummy.py           deterministic stubs (also used as test doubles)
      mannequin.py       procedural trimesh mannequin builder
      fitter.py          bounding-box outfit-GLB fitter
  scripts/
    make_sample_png.py   generates a sample transparent garment PNG
    verify_glb.py        parses a GLB with pygltflib + trimesh
  tests/                 pytest suite (65 tests)
  data/                  runtime output (gitignored)
```
