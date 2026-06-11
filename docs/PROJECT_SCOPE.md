# PROJECT_SCOPE.md — The Archive (Fit Archive)

> One-page-deep scope and feature reference for the AvatarWardrobe repository.
> Status snapshot date: 2026-06-11. For authoritative phase status, always
> defer to `PLAN.md` (Track A) and `docs/AVATAR_TRACK.md` (Track B).

---

## 1. Project summary

**The Archive** is an interactive fashion-archive web app. A user uploads
photos of clothes they own; the app runs a local demo style scan, proposes a
draft metadata suggestion the user confirms or edits, and archives each piece
into a digital closet. Pieces can be browsed, styled onto a tall faceless
mannequin in a dark editorial studio, summarized with a "Fit Check," and saved
as looks on an editorial board.

The product is an **MVP base** delivering the *illusion* of a premium digital
styling studio. It is honest about its limits: the analyzer is a local
deterministic mock (no real AI/vision), and the preview is a **2.5D layered
composition** (no real 3D virtual try-on, cloth simulation, or sizing).

Core loop:

```
upload photo → demo scan → draft suggestion → confirm → Archive Piece
→ closet / rail / room → style the mannequin → Fit Check → save look → board
```

## 2. Project tracks

The repository contains two explicitly separated tracks:

| Track | What it is | Status |
|---|---|---|
| **A — Fit Archive closet layer** | The local-first 2.5D fashion archive (Vite + React + TypeScript, no backend, no network calls). | Phases 1–12.5 complete; Phase 13 is next (`PLAN.md`). |
| **B — Avatar Lab** | An additive, user-authorized track toward an optional FastAPI job backend + 3D/GLB **proxy** avatar pipeline. Explicitly NOT real try-on. | B1–B3.9 complete; B4–B6 not started (`docs/AVATAR_TRACK.md`). |

Track B must never rewrite, rename, or degrade Track A code. Track A's bundle
and startup are unaffected by Track B (`three` is loaded only via dynamic
import inside the lab view).

## 3. In scope (built features)

### Track A — closet, styling, and archive

- **Upload ritual** — drag/drop a clothing photo; validation (type/size,
  corrupt-image rejection); a premium "demo scan" beat; a non-binding **draft
  metadata suggestion** (name, brand, category, color, tags) from a local
  deterministic mock analyzer; confirm/edit with a **required name**; an
  "Archive Piece created" moment; the new piece animates into the filmstrip.
- **Prepare display asset (manual crop)** — a local, slider-driven crop step
  producing `croppedImageUrl`; "Use crop / Use original / Reset".
- **Local background removal (opt-in cutout)** — a real, on-device,
  edge-seeded flood fill (`lib/image/garmentCutout.ts`) producing a
  transparent `cutoutImageUrl`. Non-blocking and skippable; honest
  `unavailable`/`failed` states. NOT ML/AI segmentation or cloud.
- **Product/reference step (demo)** — `mockProductMatch` offers local demo
  reference candidates plus manual entry; the user picks the archive display
  image (uploaded vs reference). No real search or recognition.
- **Digital closet** — editorial garment cards (image hero, serif name, brand
  line, color swatch, tags), category tabs, a bottom garment filmstrip, and a
  garment editor.
- **Studio room** — dark editorial scene with clothing rack, central styled
  mannequin, decorative mirror, in-scene empty-state prompt, and a compact
  "Current Fit" rail (≥1240px viewports).
- **Mannequin & mirror (2.5D)** — a tall, faceless SVG silhouette with body
  zones (outerwear / top / pants / shoes / accessory); selected garment photos
  layer onto zones as matted panels (`mix-blend-mode: multiply`). The Mirror
  view adds an honest "2.5D layered styling preview" caption with category
  chips, a layer count, and a silhouette hint.
- **Fit Check** — a deterministic, local palette/tone/style/notes read of the
  current outfit (no AI).
- **Saved outfit board** — save the current look (with a derived vibe label),
  browse an editorial wall of saved cards (thumbnail strip, categories, date),
  restore or delete looks. Deleting a look never deletes garments.
- **Persistence (local-first)** — storage behind `ArchiveStorageAdapter` with
  IndexedDB → localStorage → memory fallback; writes gated on hydration so an
  empty initial state never clobbers stored data; heavy cropped/cutout images
  stored as Blobs in a separate IndexedDB blob store with lightweight metadata
  + thumbnail fallback; fail-closed orphan-blob sweep with a ~1h age gate;
  everything survives a full reload.
- **Sample data** — a procedural SVG seed set ("Load sample") so the studio is
  demo-able without uploads.
- **Quality harness** — 240+ Vitest tests (reducer, domain helpers, storage
  adapters/facade, provider reload round-trips, upload-flow reducer,
  copy-honesty guards, component behavior, full `<App/>` mount); strict
  TypeScript; ESLint; a no-deps headless-Chrome CDP screenshot harness for
  visual verification.

### Track B — Avatar Lab (additive, optional backend)

- **Backend spike (`backend/`, B2)** — a local-only FastAPI service:
  `POST /api/proxy-3d` turns a PNG into an honest **proxy 3D** GLB — a
  textured, lightly extruded silhouette card (or an explicit flat-card
  fallback) — with job-shaped records persisted to disk, status/result GETs,
  honest `limitations` metadata, and pytest coverage.
- **Proxy 3D Lab view (B3–B3.8)** — an additive frontend view: upload PNG →
  generate → inspect the GLB in a lazily-loaded three.js viewer (WebGL
  fallback, full disposal); cutout-first flow (no silent flat-card fallback);
  optional back image for a dual-sided GLB with deterministic bounding-box
  alignment plus manual scale/offset tuning; per-side cutout tuning sliders;
  honest verdict copy throughout.
- **Closet bridge (B3.9)** — a garment's optional, parser-tolerant
  `proxy3dPreview` link (job id + metadata only; no blob-store bytes, so it is
  intentionally NOT in `garmentBlobKeys`); "Create/View 3D preview" entries
  and a "3D" badge on closet cards; honest reopen/regenerate UX when the
  backend is off or a result is gone.

## 4. Out of scope (do not build, do not imply)

**Track A (binding):**

- No backend, auth, accounts, cloud storage, or server — storage is local;
  the Track A web app makes no network calls.
- No real AI/Vision API calls — the analyzer is `mockGarmentAnalysis.ts`.
- No claim of real 3D virtual try-on — the preview is 2.5D layered.
- No cute/chibi/cartoon avatar or kids-room aesthetic — the mannequin is a
  tall, faceless silhouette in a premium dark editorial showroom.
- No heavy dependency bloat — justify every new dependency.

**Track B (binding, any phase):**

- No real 3D body reconstruction (no SMPL/PIFu/photogrammetry).
- No heavy ML (no mediapipe/torch/onnx); no paid or cloud APIs.
- No auth, accounts, or remote storage; no marketplace/resale platform.
- No claim of real try-on or accurate fit, anywhere.
- No restructuring of Track A; no starting a new B phase without the user
  explicitly asking.

**Honest wording (both tracks).** User-facing copy may say: "demo style
scan", "draft metadata suggestion", "local preview", "2.5D layered preview",
"local background removal", "proxy 3D preview". It must never claim real AI
recognition, automatic background removal, AI cutout, real virtual try-on,
real 3D fitting, cloth simulation, or accurate sizing. Copy guards are
enforced by unit tests (`UPLOAD_COPY` honesty test and friends).

## 5. Planned / future (NOT built — do not imply these exist)

- **Track A future:** ML/WASM segmentation for higher-quality cutouts (the
  `CutoutDeps` + `assetBlobStore` seams are ready), real Vision API / product
  recognition, a Three.js / React Three Fiber room, virtual try-on research.
- **Track B next phases:** B4 — generic jobs API (`/api/jobs`) + pipeline
  interfaces with dummy implementations; B5 — proxy avatar composition
  end-to-end; B6 — wardrobe bridge (size/material/status fields, outfit-GLB
  asset refs through the blob-store pattern, local template-based listing
  text).

## 6. Architecture at a glance

- **Stack:** Vite + React 18 + TypeScript (strict), plain CSS with design
  tokens (`src/styles/archive-theme.css`), Vitest + Testing Library.
  Track B backend: FastAPI + pytest in `backend/` (local-only).
- **Layering (dependencies point downward only):**
  `domain/` (pure types + logic) → `lib/` (storage, ai, image, utils) →
  `app/providers/` (state) → `components/` (UI).
- **State:** one `ArchiveProvider` over a pure `archiveReducer` —
  ids/timestamps/events arrive via action payloads; all `Date.now()`/`crypto`
  lives in action creators.
- **Images:** always render via `getGarmentDisplayImage(garment)`
  (cutout → display → cropped → original → `imageDataUrl`); garments always
  downscale to thumbnails before storage; heavy assets are blob-backed only
  on a durable (IndexedDB) store.

## 7. Commands

```bash
npm install        # first time only
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # eslint (flat config)
npm test           # vitest run
npm run build      # tsc --noEmit && vite build
```

Track B backend: see `backend/` (pytest-covered; run locally only).

## 8. Related documents

- `PLAN.md` — Track A source of truth: phase history, audits, verification.
- `docs/AVATAR_TRACK.md` — Track B scope, architecture, phase plan.
- `docs/ARCHITECTURE.md` — layering, state, storage details.
- `docs/ROADMAP.md` — delivered phases + clearly-labeled future work.
- `docs/AI_IMAGE_PIPELINE.md` — current image pipeline + extension seams.
- `docs/QA_CHECKLIST.md` — manual verification checklist.
- `CLAUDE.md` — working rules for CLI sessions in this repo.
