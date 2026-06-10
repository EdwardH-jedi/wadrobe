# AVATAR_TRACK.md — Track B: Avatar Lab (additive 3D/GLB track)

> **Status: B2–B3 DONE.** As of 2026-06-10: the **B2 spike** (PNG →
> proxy-3D GLB, `backend/`, FastAPI, 22 pytest tests; see
> `backend/README.md`) and the **B3 frontend** (additive "Proxy 3D Lab" view,
> `src/components/avatar/`, with `three` lazy-loaded only inside the GLB
> viewer) are implemented. The five pipeline interfaces, the generic
> `/api/jobs` API, and any avatar/outfit composition are **NOT built**. Do
> not imply more than this exists in code, UI copy, comments, or docs.

---

## 1. What this track is

AvatarWardrobe's longer-term product direction includes an **avatar try-on
lab**: the user provides a face photo and a full-body photo, the system builds
an *approximate* 3D avatar, fits a user-provided outfit 3D file
(`.glb`/`.gltf`) onto it, and exports a single combined GLB viewable in the
browser.

A 2026-06-08/10 repo audit confirmed none of this exists yet. The repository
contains only **Track A**: the fit-archive closet layer (local-first 2.5D
fashion archive, Vite + React, 229 passing tests). The user has confirmed that
Track A **is** the AvatarWardrobe v0 closet layer — it is not a wrong or
throwaway codebase — and has authorized Track B as a separate, additive track.

## 2. Relationship to Track A (hard rules)

- Track B is **additive only**. It must never rewrite, rename, move, delete,
  or degrade Track A code (`src/`, `docs/`, tests, styles).
- Track A's `CLAUDE.md` rules (honest wording, no dependency bloat, small
  verified changes, pure reducer, storage invariants) stay in force everywhere.
- Track A's test suite must remain green after every Track B change. A Track B
  phase that breaks a Track A test is not done.
- Track B work happens **only when the user explicitly starts a Track B
  phase**. Default sessions continue Track A per `PLAN.md`.

## 3. Intended architecture (target, not current state)

```
AvatarWardrobe/
  src/, docs/, ...               # Track A frontend — untouched
  backend/                       # Track B (Phase B2+): FastAPI service
    app/main.py                  #   POST /api/jobs
                                 #   GET  /api/jobs/{job_id}
                                 #   GET  /api/jobs/{job_id}/result  (GLB)
    app/jobs.py                  #   in-memory job store + BackgroundTasks
    app/pipeline/interfaces.py   #   IBodyEstimator, IAvatarBuilder,
                                 #   ITextureProjector, IOutfitFitter, IExporter
    app/pipeline/dummy.py        #   proxy implementations (see §4)
    data/jobs/<id>/              #   uploaded inputs + result.glb (local files)
    tests/                       #   pytest
```

- **Backend:** FastAPI + uvicorn + pydantic. Local-only, no auth, no cloud, no
  paid APIs. Job states: `queued → processing → done | failed` with an honest
  `error` field on failure.
- **Frontend:** a new, lazily-loaded "Avatar Lab" view added beside the four
  existing studio views (`src/components/studio/views.ts`), plus a Vite dev
  proxy (`/api` → `127.0.0.1:8000`). The viewer uses `three` (GLTFLoader +
  OrbitControls) via dynamic import so Track A's bundle is unaffected. This is
  the **only** planned heavy dependency, justified by the GLB viewer
  requirement.
- **Job-flow state:** a pure reducer modeled on `uploadFlow.ts`
  (`idle → uploading → queued → processing → done | failed`), unit-tested the
  same way, with its user-facing copy guarded by the existing
  `FORBIDDEN_CLAIM_TERMS` honesty test pattern.

**Current state (after B2–B3):** the spike subset of this architecture
exists — `backend/app/main.py` (`/api/proxy-3d` routes), `app/config.py`,
`app/storage.py`, and `app/proxy3d/` (pipeline + meshbuild), with results
under `backend/data/proxy_3d/<job_id>/`. `app/jobs.py` and
`app/pipeline/interfaces.py` are still future. The spike generates
synchronously (sub-second deterministic work; a queue would only add states
and races) but returns job-shaped records with a `job_id`, so a later async
backend keeps the same API surface.

On the frontend, the additive **Proxy 3D Lab** view exists
(`'lab'` in `src/components/studio/views.ts`, components in
`src/components/avatar/`): a pure `proxy3dFlow` reducer
(idle → selected → uploading → ready/failed), a `proxy3dApi` client, and a
`GlbViewer` that dynamic-imports `three` + GLTFLoader + OrbitControls only
when mounted (Track A's bundle and startup are unaffected; the viewer falls
back to download-only when WebGL is unavailable). Lab copy is guarded by
`PROXY3D_FORBIDDEN_CLAIM_TERMS` (`src/test/honesty.ts`) — "proxy 3D
preview" / "image-to-3D proxy" wording only, never try-on/accuracy/fit
claims.

**Routing:** `/api` is proxied to `127.0.0.1:8000` by the Vite dev server
(`server.proxy` in `vite.config.ts`), and `npm run preview` inherits the
same proxy (verified), so no CORS configuration exists or is needed
locally. A real production deployment still needs its own routing decision
(serve `dist/` and `/api` behind one reverse proxy) — deliberately NOT
solved in this phase.

**B3.5 verification pass (2026-06-10):** exercised in real Chrome via CDP
with synthesized input — OrbitControls drag/zoom, multiple uploads per
session (one canvas at all times; navigation away leaves zero canvases; no
console errors beyond the intentional 4xx network lines), the full PNG
edge-case matrix (opaque fallback, fully-transparent / corrupt / over-size
errors, 3000×3000 accepted, >10 MB client-rejected, spaces + Korean
filenames), WebGL-disabled fallback message, and front/back/transparency/
orientation checks with an asymmetric marker PNG. Two honesty fixes landed:
a bare (non-JSON) 5xx is now reported as "backend did not answer — it may
not be running" instead of "backend rejected the request", and the "make
sure the backend is running" hint shows only on connectivity failures, not
on validation errors the backend itself returned.

## 4. Dummy/proxy pipeline (deliberate scope ceiling)

Hard 3D/ML parts ship as **honest proxies** so the demo loop works end to end
without real reconstruction:

- `IBodyEstimator` — canned body proportions, optionally scaled from the
  full-body photo's aspect ratio. No pose estimation, no ML.
- `IAvatarBuilder` — parametric low-poly humanoid assembled from primitives
  (e.g. via `trimesh`). Tall, faceless, fashion-mannequin styling consistent
  with Track A's visual direction.
- `ITextureProjector` — pass-through, or at most pastes the face photo onto a
  head plane. No real texture projection.
- `IOutfitFitter` — merges the user's outfit GLB into the avatar scene with a
  bounding-box align/scale heuristic. No cloth simulation, no real fitting.
- `IExporter` — exports one combined `result.glb`.

Python deps ceiling for the dummy pipeline: `fastapi`, `uvicorn`, `pydantic`,
`numpy`, `trimesh`, `pygltflib`. All free and local.

## 5. Honest wording (binding, same spirit as Track A)

User-facing copy for Track B MAY say: "avatar lab", "proxy avatar",
"approximate avatar", "proxy composition", "demo pipeline", "placeholder
fitting", "combined GLB export", "local processing".

It must NOT say: "real virtual try-on", "accurate body fit", "3D body
reconstruction", "AI avatar", "body scanning", "cloth simulation", "true to
size" — until such a thing genuinely exists. Track B copy must pass the same
honesty-guard test pattern as `UPLOAD_COPY`.

## 6. Phase plan

_Table revised 2026-06-10: at the user's direction, B2 was narrowed from a
generic jobs API to a feasibility spike for the most important capability
(image → proxy-3D GLB). The generic jobs API and avatar composition moved to
B4–B5._

| Phase | Scope | Status |
|---|---|---|
| **B1** | Git baseline + two-track docs (this file; CLAUDE.md §0; PLAN.md tracks note). No code changes. | ✅ Done (2026-06-10) |
| **B2** | Feasibility spike — PNG → proxy-3D GLB: `backend/` FastAPI service; `POST /api/proxy-3d` (synchronous, job-shaped records persisted to disk) + status/result GETs; alpha-mask extruded silhouette slab or textured-plane fallback; honest `limitations` metadata; 22 pytest tests; sample + verifier scripts. No frontend changes. | ✅ Done (2026-06-10) |
| **B3** | Frontend Proxy 3D Lab view (additive): upload PNG → call `/api/proxy-3d` → show status/errors + honest generation report → download result.glb; three.js viewer lazy-loaded only inside the view (WebGL-failure fallback, full disposal on unmount); pure job-flow reducer + honesty-guarded copy; Vite dev proxy. Verified in headless Chrome incl. texture orientation. Track A tests stay green (247 total). | ✅ Done (2026-06-10) |
| **B4** | Generic jobs API (`/api/jobs`) + pipeline interfaces (`IBodyEstimator`, `IAvatarBuilder`, `ITextureProjector`, `IOutfitFitter`, `IExporter`) with dummy impls; procedural avatar via `trimesh`. | Not started |
| **B5** | Avatar composition end-to-end: bounding-box outfit-GLB merge onto the proxy avatar; per-job composed GLB; job-state UX polish + QA checklist additions. | Not started |
| **B6** | Wardrobe bridge (later): optional `GarmentItem` fields (`sizeLabel`, `material`, `status`), outfit-GLB asset refs through the existing blob-store pattern (any new ref field MUST join `garmentBlobKeys`), resale-listing text generation (local, template-based). | Not started |

Each phase ends with: `npm run typecheck`, `npm test`, `npm run build` (and
`pytest backend` once B2 exists), plus a report of real output.

## 7. What NOT to do (any phase)

- No real 3D body reconstruction (no SMPL/PIFu/photogrammetry).
- No heavy ML (no mediapipe/torch/onnx) and no paid or cloud APIs.
- No auth, accounts, or remote storage.
- No marketplace/resale platform.
- No claim of real try-on or accurate fit, anywhere.
- No restructuring of Track A; no UI redesign of the existing studio.
- No starting B2+ without the user explicitly asking.
