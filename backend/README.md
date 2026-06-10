# AvatarWardrobe backend — Track B2 spike: PNG → proxy-3D GLB

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

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Run

```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir . --port 8000
```

## API

| Route | Purpose |
|---|---|
| `POST /api/proxy-3d` | multipart upload (`file`, a PNG); generates synchronously; returns the job record (201) |
| `GET /api/proxy-3d/{job_id}` | returns the persisted job record |
| `GET /api/proxy-3d/{job_id}/result.glb` | returns the GLB (`model/gltf-binary`) |

Errors: `415` non-PNG · `413` over the byte limit · `422` corrupt /
oversized / fully transparent image · `404` unknown job.

### curl example

```powershell
# Make a sample transparent garment PNG (or use your own):
.venv\Scripts\python.exe scripts\make_sample_png.py

curl.exe -X POST -F "file=@data\samples\sample-garment.png;type=image/png" http://127.0.0.1:8000/api/proxy-3d
# → {"job_id":"<id>", "status":"done", "method":"extruded-alpha-contour", ...}

curl.exe -o result.glb http://127.0.0.1:8000/api/proxy-3d/<id>/result.glb
.venv\Scripts\python.exe scripts\verify_glb.py result.glb
```

Results are stored under `backend/data/proxy_3d/<job_id>/` (`result.glb` +
`metadata.json`). The data root can be overridden with the
`AVATARWARDROBE_PROXY3D_DATA` environment variable.

## Tests

```powershell
.venv\Scripts\python.exe -m pytest -q
```

Covers: transparent-PNG happy path, opaque-PNG plane fallback, GLB
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
  scripts/
    make_sample_png.py   generates a sample transparent garment PNG
    verify_glb.py        parses a GLB with pygltflib + trimesh
  tests/                 pytest suite (22 tests)
  data/                  runtime output (gitignored)
```
