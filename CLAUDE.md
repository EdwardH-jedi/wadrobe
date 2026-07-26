# CLAUDE.md — The Archive (Fit Archive)

Guidance for any Claude CLI session working in this repository. Read this
first. User instructions always take precedence over this file.

---

## 0. Project tracks (read this before anything else)

AvatarWardrobe contains two explicitly separated tracks:

- **Track A — Fit Archive closet layer (BUILT).** Everything described in the
  rest of this file: the local-first 2.5D fashion archive (Vite + React, no
  backend). Phases 1–12.5 are complete per `PLAN.md`.
- **Track B — Avatar Lab (B2–B3.9 done).** A user-authorized, additive track
  toward an optional FastAPI job backend + 3D/GLB avatar try-on pipeline. As
  of 2026-06-10: **B2** — a backend spike in `backend/` (FastAPI, local-only,
  pytest-covered) that turns a PNG into an honest **proxy 3D** GLB (a
  textured, lightly extruded silhouette card, explicitly NOT real try-on);
  **B3–B3.8** — an additive frontend "Proxy 3D Lab" view (`'lab'` in
  `views.ts`, `src/components/avatar/`) with per-side cutout-first flows,
  dual-sided front/back generation, cutout tuning, and manual back
  alignment; **B3.9** — the closet bridge: `GarmentItem.proxy3dPreview?`
  (optional, parser-tolerant, metadata-only — NO blob-store bytes, so it is
  intentionally NOT in `garmentBlobKeys`) links a piece to its generated
  preview. `three` is a dependency but is loaded ONLY via dynamic import
  inside the lab's GLB viewer — Track A's bundle and startup are unaffected;
  keep it that way. See `docs/AVATAR_TRACK.md`.

Track B may add a backend and 3D dependencies **inside its own explicitly
started phases only** (see `docs/AVATAR_TRACK.md`); until then, every "What
NOT to build" rule below stands. Track B must never rewrite, rename, or
degrade Track A code.

## 1. Project vision

**The Archive** is an interactive fashion archive web app. A user uploads
photos of clothes they own; the app classifies and archives each piece, lets
them browse their digital closet, assemble outfits on a tall faceless
mannequin, run a "Fit Check," and save looks to an editorial board.

The current build is an **MVP base** that delivers a convincing *illusion* of a
premium digital styling studio, with an architecture designed to grow toward
real image processing, AI product recognition, and 3D.

The core loop:
`upload photo → demo scan → draft suggestion → confirm → Archive Piece →
closet / rail / room → style the mannequin → Fit Check → save look → board`.

## 2. Product direction

This must read as a **premium fashion archive** — a dark editorial showroom, a
designer's private styling studio, a streetwear/vintage wardrobe OS, an
interactive portfolio-worthy digital closet. Uploaded clothing photos are the
visual focus.

## 3. What NOT to build

- ❌ NOT cute, childish, beige, cozy, or a kids-room game.
- ❌ NO chibi/cartoon avatar. The mannequin is a **tall, faceless** silhouette.
- ❌ NO backend, auth, accounts, or server in Track A. Storage is local.
  (Track B owns the optional backend: a spike service exists in `backend/`
  since phase B2 — see §0 and `docs/AVATAR_TRACK.md`. Track A added an OPTIONAL,
  off-by-default Vercel serverless layer in `api/` — `product-meta` (Phase 3)
  and `analyze` (Phase 4) — reached only when `VITE_API_BASE` (and, for vision,
  `VITE_ANALYZER=vision`) is configured. With env unset, the web app makes no
  network calls.)
- ❌ NO real AI/Vision API calls **by default**. The analyzer is the local mock
  unless the operator explicitly opts into the backend vision provider via env
  (`VITE_ANALYZER=vision` + `VITE_API_BASE`; see `createAnalyzer.ts` /
  `api/analyze.ts`). When that path runs, the upload scan copy honestly states
  the photo is sent to a server, and the guess stays a draft the user confirms.
- ❌ NO claim — in UI, copy, comments, or docs — that the app performs **real
  3D virtual try-on**. It does not. It is a 2.5D layered composition.
- ❌ NO heavy dependency bloat. Justify every new dependency.

**Honest wording.** The analyzer is a local deterministic mock by default (an
optional env-gated cloud vision provider exists — Phase 4 — with its own honest
"sent to a server" scan copy); the preview is 2.5D. User-facing copy MAY say: "demo style scan", "draft metadata suggestion",
"local preview", "2.5D layered preview", "mirror composition", "manual crop",
"prepare display asset", "2D garment asset", "future cutout support". It must NOT
claim real AI recognition, exact product identification, AI cutout, automatic
background removal, real virtual try-on, real 3D fitting, cloth simulation, or
accurate sizing/body fit. (`uploadFlow.ts` `UPLOAD_COPY` is guarded by an honesty
unit test.)

## 4. Visual design rules

- Base: dark charcoal / off-black / warm grey. Materials: walnut, brushed
  metal/chrome, concrete, leather, glass. Warm brass spotlight accent
  (`--accent`), used sparingly.
- Editorial typography: serif display (`--font-display`, Bodoni Moda → system
  serif fallback) for titles; clean sans (`--font-sans`, Inter → system) for UI.
- Tokens live in `src/styles/archive-theme.css` (`:root`). **Use the tokens** —
  do not hardcode new colors. Reset/base lives in `globals.css`.
- Garment photos sit in **light matte panels** with `mix-blend-mode: multiply`
  so white flat-lay backgrounds drop out cheaply. Keep that pattern.
- Respect `prefers-reduced-motion` (already wired globally).

## 5. Architecture rules

- Stack: **Vite + React 18 + TypeScript (strict)**. Plain CSS (no CSS-in-JS, no
  Tailwind). Tests with Vitest + Testing Library.
- Layering (dependencies point downward, never up):
  `domain/` (pure types + logic) → `lib/` (storage, ai, image, utils) →
  `app/providers/` (state) → `components/` (UI).
- **State**: one `ArchiveProvider` (React context) over a **pure reducer**
  (`archiveReducer.ts`). The reducer takes ids/timestamps/events in its action
  payloads so it stays deterministic and unit-testable. All `Date.now()` /
  `crypto` calls live in the provider's action creators, never the reducer.
- **Persistence** is abstracted behind `ArchiveStorageAdapter`
  (`lib/storage/`). The facade picks IndexedDB → localStorage → memory. Writes
  are gated on a `hydrated` flag so initial empty state never clobbers stored
  data. The IDB probe has a timeout so a stalled `open()` falls back.
- **Asset blobs (Phase 11–12)**: a NEW upload's heavy cropped/cutout images are
  stored as Blobs in `lib/storage/assetBlobStore.ts` (a separate IDB DB); garment
  metadata keeps the `imageDataUrl` thumbnail + `croppedImageRef`/`cutoutImageRef`.
  `garmentAssetStorage.ts` dehydrates on persist / hydrates the display blob to an
  object URL on load (keyed off `assetMode`, so precedence holds). It is
  **ref-conditional** (legacy/no-ref garments untouched) and only blob-backs on a
  **durable** (IDB) store — otherwise data URLs persist as before.
  `getGarmentDisplayImage` stays synchronous; never add async blob resolution into
  UI components. `garmentBlobKeys` is the **single** owned-keys source for BOTH
  delete-cleanup and the **orphan sweep** (`cleanupOrphanBlobs`, using a frozen
  pre-hydration key snapshot, run fire-and-forget after hydrate, **fail-closed**)
  — any new blob ref field MUST be added there. The sweep deletes a blob only if
  unreferenced AND **older than ~1h** (12.5 age gate — blob keys embed a timestamp
  `asset_<ms>_<uuid>`; recent/cross-tab and legacy timestamp-less blobs are kept)
  AND the metadata read returned `ok` (`loadGarmentsResult`; an `unavailable` read
  skips the sweep). The thumbnail-always design means a missing blob degrades to
  the thumbnail, so orphan cleanup is disk hygiene, not data-loss prevention.
  Persistence is fire-and-forget app-wide (a failed save is silent; orphans
  reclaimed on a later readable load once they age out).
- **Backup & transfer (archive JSON)**: `archiveExport.ts` writes ONE
  self-contained document (`kind` + `schemaVersion` + garments + saved outfits +
  current outfit) through a chunked `write(chunk)` sink, one garment at a time
  (never a full object graph *and* a full JSON string at once). Blob refs are
  **resolved and inlined as base64, and the refs are dropped** — a blob key means
  nothing outside the profile that minted it — and `blob:` object URLs never
  reach the file. `archiveImport.ts` validates every entry through the EXISTING
  `storageTypes.ts` parsers, one at a time, and reports each drop as an
  `ArchiveImportIssue` before anything is committed; `merge` (default) never
  overwrites an existing id, `replace` is a separate explicit choice. Additive
  only: no existing type changed shape. See `docs/ARCHITECTURE.md`.
- Keep the reducer pure; do I/O in effects/action creators.
- Comments and identifiers: **English only**.

## 6. Testing & commands

```bash
npm install        # first time only
npm run dev        # local dev server (http://localhost:5173)
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # eslint (flat config)
npm test           # vitest run
npm run build      # tsc --noEmit && vite build
```

Before claiming work is done, run typecheck + test + build and report real
output. Tests (100+) cover the domain (reducer, fit-check, outfit/draft helpers),
the storage adapters + facade, the upload-flow reducer + copy honesty, the
provider (incl. reload/persistence + delete-keeps-garments), and component
behavior (mannequin zones, mirror caption, saved cards, required-name, a full
`<App/>` mount). Keep the canvas/image path out of unit tests — jsdom has no
canvas (decode validation is tested via a stubbed `Image`).

## 7. Implementation constraints

- Prefer **small, incremental, verified** changes.
- Don't overbuild. This is an MVP base, not a product.
- The mock suggestion is **never binding**: the user always confirms/edits before
  a piece is archived (and a name is required). Preserve that.
- Garment images are always **downscaled to thumbnails** before storage (keeps
  the localStorage fallback within quota). Never store full-res in localStorage.
- Render garment images via **`getGarmentDisplayImage(garment)`** (cutout →
  display → cropped → original → `imageDataUrl`), never raw `imageDataUrl`. New
  garments carry a `GarmentAsset`; legacy ones fall back. `displayImageUrl` is the
  *resolved* choice (crop or product reference) and outranks `croppedImageUrl` so
  a reference is never shadowed — preserve that ordering.
- The upload **crop step** ("Prepare display asset") is a **manual, local crop**
  (`lib/image/cropGeometry.ts` + `cropImage.ts`) that produces `croppedImageUrl`.
  The **cutout step** ("Local background removal") is a **real, on-device,
  opt-in** edge-seeded flood fill (`lib/image/garmentCutout.ts`) producing a
  transparent `cutoutImageUrl` — it is **NOT** ML/AI segmentation, cloud, product
  recognition, or 3D; it is non-blocking (`unavailable`/`failed` are honest) and
  skippable. Both work from the downscaled thumbnail. `displayImageUrl` +
  `assetMode` hold the user's latest intentional display choice; an accepted
  cutout sets both in lockstep, so it never shadows a product reference. Wording
  may say "local background removal / experimental garment cutout / local preview
  only / quality varies" — never "AI cutout", "automatic background removal",
  "perfect cutout", or "real try-on". Product/reference matching stays a **local
  demo** (`mockProductMatch`) the user confirms.

## 8. Roadmap (summary)

See `docs/ROADMAP.md` for detail. Phase numbers match `PLAN.md`.

- **Phases 1–12 (done):** core data flow → clothes central → upload ritual →
  mannequin/mirror preview → saved board → architecture/docs hardening → Codex
  review prep → product-match & `GarmentAsset` pipeline → garment asset compiler
  (manual crop + layer presets) → real local background removal / cutout
  (`garmentCutout.ts`, edge flood fill; opt-in, non-blocking, not ML/cloud) →
  asset storage hardening (IndexedDB blob store for heavy cropped/cutout images;
  lightweight metadata; backwards-compatible, precedence-preserving) →
  storage-consistency hardening (fail-closed orphan-blob sweep, object-URL
  lifecycle) → **cross-tab sweep safety** (blob-age gate + explicit metadata-read
  status).
- **Future (NOT built — do not imply these exist):** ML/WASM segmentation for
  higher-quality cutouts (the `CutoutDeps` + `assetBlobStore` seams are ready),
  real Vision API / product recognition, Three.js / R3F room, virtual try-on
  research.
- **Track B — Avatar Lab (B2–B3 done):** optional FastAPI backend + 3D/GLB
  proxy viewer, a separate additive track. B2 (PNG → proxy-3D GLB spike,
  `backend/`) and B3 (frontend Proxy 3D Lab view + lazy three.js GLB viewer)
  are implemented; pipeline interfaces, `/api/jobs`, and avatar composition
  are not. Scope and phases live in `docs/AVATAR_TRACK.md`, not here.

Extension points are documented inline in `mockGarmentAnalysis.ts`,
`indexedDbStorage.ts`, `MannequinPreview.tsx`, and `lib/image/garmentCutout.ts`,
and in `docs/ARCHITECTURE.md` / `docs/AI_IMAGE_PIPELINE.md`.

## 9. Where things live

```
src/
  app/            App + providers (ArchiveProvider, reducer, context, hook)
  components/
    ui/           Button, Badge, Panel, Modal, EmptyState, Icon
    closet/       ClosetPanel, GarmentCard, GarmentFilmstrip, CategoryTabs,
                  UploadGarmentModal, GarmentEditor
    outfit/       OutfitInspector, OutfitBuilder, SavedOutfitCard, FitCheck
    avatar/       Proxy3DLab, GlbViewer, proxy3dFlow, proxy3dApi (Track B3;
                  three.js via dynamic import only)
    settings/     ArchiveTransferModal (backup & transfer: archive JSON
                  export/import, opened from the sidebar footer)
    studio/       ArchiveStudio, StudioScene, SidebarNav, RoomZone,
                  ClothingRack, MirrorPreview, MannequinPreview, OutfitWallBoard
  domain/         garmentTypes, outfitTypes, archiveTypes, garmentTaxonomy,
                  garmentDraft, fitCheck
  lib/            storage/, ai/, image/, color, cx, id, format
  data/           seedGarments (procedural SVG sample set)
  styles/         globals.css, archive-theme.css
  test/           setup, factories
docs/             ARCHITECTURE, ROADMAP, AI_IMAGE_PIPELINE, QA_CHECKLIST,
                  CODEX_REVIEW, AVATAR_TRACK
backend/          Track B spike (FastAPI): app/ (main, config, storage,
                  proxy3d pipeline + meshbuild), tests/ (pytest), scripts/
.claude/skills/   product-vision, ui-style-guide, testing-harness,
                  ai-image-pipeline
```

## 10. Phase discipline & review

- **`PLAN.md` is the source of truth for Track A.** Read it first; implement
  only the **next incomplete phase** unless the user says otherwise. After each
  phase: update PLAN.md status, run typecheck/test/lint/build, and report real
  output. Track B (avatar lab) phases live in `docs/AVATAR_TRACK.md` and only
  proceed when the user explicitly asks for them.
- Keep changes **small, incremental, and verified**. Don't rewrite the app.
- **Codex** is used for external review between phases; keep honest handoff notes
  in `docs/CODEX_REVIEW.md`.
