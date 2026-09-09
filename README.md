# Wardrobe

A local-first **fashion archive** for clothes you own. Upload a photo, confirm
the item's details, browse your closet, compose an outfit on a faceless mannequin,
and save looks to an editorial board.

The default experience is a browser-only archive with a **2.5D layered styling
preview** and local demo metadata suggestions. Optional serverless image-analysis
and product-reference integrations, plus an experimental FastAPI proxy-3D lab,
are implemented as separate, opt-in paths.

[Architecture](docs/ARCHITECTURE.md) · [Feature scope](docs/PROJECT_SCOPE.md) ·
[Automated checks](https://github.com/EdwardH-jedi/wadrobe/actions/workflows/ci.yml)

## Try the local archive

Use Node.js 22 and the committed npm lockfile:

```bash
npm ci
npm run dev
# Open http://localhost:5173
```

Click **Load sample** to explore the closet without uploading a photo, or
**Upload** an item, confirm its metadata, compose a look, and save it to the board.
The default archive needs no cloud credentials. The sample set is demo content.

## Implemented modes

| Mode | What it does | Requirements and limits |
|---|---|---|
| Local archive (default) | Clothing photos, editable purchase metadata, outfit composition, saved looks | IndexedDB with localStorage and non-persistent memory fallbacks; metadata suggestions are deterministic mocks |
| Local asset preparation | Manual crop and opt-in background cutout | Edge-seeded flood fill, not ML segmentation; difficult backgrounds can fail |
| Optional vision | Sends a thumbnail to a serverless provider for draft category, color, and tags | `VITE_API_BASE` plus `VITE_ANALYZER=vision`, server credentials, and the upload consent flow; user confirms the draft; errors fall back to the mock |
| Optional product references | Reads product-page metadata; optional shopping candidate search | Configured serverless routes; eBay search additionally requires `VITE_CANDIDATES=search` and server credentials; candidates require user approval |
| Proxy 3D Lab | Front/back PNGs to a textured GLB preview, with cutout and alignment controls | Local FastAPI service and lazy-loaded Three.js; an extruded silhouette or flat plane, not reconstructed clothing |

**Proxy 3D is not virtual try-on, cloth simulation, or accurate body fitting.**
Provider integration code is present; passing local tests does not establish live
provider availability or recognition accuracy.

## Optional services

The serverless handlers live in `api/`. See [.env.example](.env.example) for the
frontend opt-ins and server-only credentials. `npm run dev` serves the Vite app;
it does **not** execute the serverless handlers. Product-reference and vision
requests require those handlers to be served separately or deployed. The FastAPI
service below handles proxy 3D, not those serverless routes.

To run the local proxy-3D backend, in a second terminal:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

Vite forwards `/api` requests to `http://127.0.0.1:8000` for the local lab.
Windows instructions and the GLB API contract are in [backend/README.md](backend/README.md).

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
# From backend/ with its virtual environment active:
python -m pytest -q
```

CI runs the frontend checks and a separate Python backend test job, without
production credentials. Frontend unit/component tests exercise `src/`; `api/`
handlers are also typechecked, but live vision, shopping, and deployed serverless
behavior need separate integration verification. Inspect the workflow run for
the exact commit being reviewed.

## Stack and storage

- **Frontend:** React 18, TypeScript, Vite, CSS design tokens, Vitest and Testing Library.
- **3D lab:** dynamically imported Three.js; FastAPI, Pillow, trimesh, and pygltflib.
- **Optional serverless layer:** TypeScript handlers for analysis and product references.

Metadata uses IndexedDB → localStorage → memory fallback. Memory storage is
non-persistent. Cropped/cutout image blobs use a separate IndexedDB store when
available; the downscaled thumbnail is retained as a fallback. A conservative
orphan sweep protects recently written and referenced blobs. Full-resolution
archival, atomic metadata/blob writes, and complete multi-tab coordination remain
limitations; the archive is not a cloud backup.

## Engineering decisions

- Keep local use independent of provider availability; failed AI suggestions retain
  their mock provenance instead of being presented as real recognition.
- Keep a pure domain reducer and perform storage/network I/O in the provider layer.
- Preserve the user's chosen image and metadata source across edits and reloads.
- Isolate the experimental 3D path from the normal closet startup.

Further detail: [image pipeline](docs/AI_IMAGE_PIPELINE.md),
[avatar track](docs/AVATAR_TRACK.md), [implementation plan](PLAN.md), and
[manual QA checklist](docs/QA_CHECKLIST.md).
