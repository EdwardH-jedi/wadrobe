# AVATAR_TRACK.md — Track B: Avatar Lab (additive 3D/GLB track)

> **Status: PLANNED — NOT BUILT.** As of 2026-06-10 this track is
> documentation only. There is no FastAPI code, no Python, no three.js
> dependency, no `.glb`/`.gltf` asset, and no `/api/jobs` route anywhere in
> this repository. Do not imply otherwise in code, UI copy, comments, or docs.

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

| Phase | Scope | Status |
|---|---|---|
| **B1** | Git baseline + two-track docs (this file; CLAUDE.md §0; PLAN.md tracks note). No code changes. | ✅ Done (2026-06-10) |
| **B2** | FastAPI skeleton: jobs API (`POST /api/jobs`, `GET /api/jobs/{id}`, `GET /api/jobs/{id}/result`), pipeline interfaces, dummy impls returning a static placeholder GLB, pytest suite. No frontend changes. | Not started |
| **B3** | Real proxy composition: procedural avatar + bounding-box outfit merge via `trimesh`; per-job composed GLB; pipeline tests. | Not started |
| **B4** | Frontend Avatar Lab view: image + outfit-GLB upload, job creation/polling reducer, three.js GLB viewer (dynamic import), Vite proxy. Track A tests stay green. | Not started |
| **B5** | Job-state UX polish, honest error surfaces, result download, QA checklist additions. | Not started |
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
