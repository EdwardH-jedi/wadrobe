# Architecture

Last verified: 2026-08-21

How the app is put together and where to extend it. For *what currently exists*
and what does not, see [`PROJECT_STATUS.md`](PROJECT_STATUS.md) — this document
describes structure, not status.

## 1. System Overview

The Archive is a **browser-only single-page application**. The wardrobe product
needs no server: garments, looks, and image bytes all live in the user's browser,
and in the default configuration the app makes no network request at all.

Two optional server layers sit *outside* that core. Neither is imported by it,
both are reached over HTTP, and both are inert unless explicitly configured:

- **`api/`** — three Vercel Edge functions providing optional metadata lookups.
- **`backend/`** — a local FastAPI service backing an experimental image-to-3D
  research track, hidden behind a build flag.

They are **separate services, not duplicates**: their route sets are disjoint,
they share no runtime, and neither calls the other. See
[§4](#4-backend-architecture).

### Stack


- **Vite 6 + React 18 + TypeScript** (strict mode).
- **Plain CSS** with design tokens (`src/styles/`). No CSS-in-JS, no utility
  framework.
- **Vitest + Testing Library + jsdom** for tests. **ESLint 9** (flat config).
- Runtime dependencies: `react`, `react-dom`, and `three`. **three.js is reached
  from exactly one lazy-loading site** — three dynamic imports (core,
  `GLTFLoader`, `OrbitControls`) in a single `Promise.all` inside the
  experimental lab's GLB viewer — so a default visitor never downloads it; the
  production build splits them into their own chunks. Keep it that way. (Editorial fonts load progressively
  from Google Fonts with a system fallback; the app works offline.)

### Layering


Dependencies point strictly downward:

```
components/  (React UI)
   │
app/providers/  (ArchiveProvider — context + reducer + persistence effects)
   │
lib/  (storage, ai, image, candidates, productMatch, color, id, cx, format)
   │
domain/  (pure types + pure logic: taxonomy, fitCheck, drafts, market value)
```

`domain/` and most of `lib/` are framework-free and unit-testable in isolation.

Two optional server layers sit *outside* this stack. Neither is imported by it;
both are reached over HTTP and both are inert unless configured:

```
api/        optional Vercel Edge functions (product-meta, analyze, candidate-search)
backend/    experimental local FastAPI service (proxy-3D + an unconsumed jobs API)
```

## 2. Architecture Diagram

```
                    ┌──────────────────────────────────┐
                    │   Browser (the entire product)   │
                    │                                  │
                    │   React 18 + TypeScript          │
                    │   components/                    │
                    │        │                         │
                    │   app/providers/  (pure reducer) │
                    │        │                         │
                    │   lib/  ──────────  domain/      │
                    │        │                         │
                    │   ┌────┴─────────────────────┐   │
                    │   │ IndexedDB  (metadata)    │   │
                    │   │ IndexedDB  (image blobs) │   │
                    │   │  ↓ fallback: localStorage│   │
                    │   │  ↓ fallback: in-memory   │   │
                    │   └──────────────────────────┘   │
                    └────────┬────────────────┬────────┘
                             │                │
              OPTIONAL, off by default    EXPERIMENTAL, flag-gated
                             │                │
                             v                v
              ┌──────────────────────┐  ┌──────────────────────────┐
              │ api/  Vercel Edge    │  │ backend/  FastAPI        │
              │  absolute URL from   │  │  relative /api/proxy-3d  │
              │  VITE_API_BASE       │  │  via the Vite dev proxy  │
              │                      │  │                          │
              │  /api/analyze        │  │  /api/proxy-3d/*         │
              │  /api/product-meta   │  │  /api/jobs/*  (unused    │
              │  /api/candidate-     │  │      by any frontend)    │
              │       search         │  │                          │
              └──────┬───────────────┘  └───────────┬──────────────┘
                     │                              │
              Anthropic API                   local disk
              eBay Browse API                 (backend/data/)
```

Solid arrows are the only network paths that exist. With no environment
configuration, neither is ever taken.

## 3. Client Architecture

- **Framework:** React 18 with TypeScript in strict mode, built by Vite 6.
- **Navigation:** no router. A single `StudioView` union (`studio | closet |
  lookbook | mirror | outfits | lab`) held in `ArchiveStudio.tsx` state and
  rendered through a switch. `visibleViewOrder()` decides which views the
  sidebar lists, which is how the experimental lab is withheld
  ([§4](#4-backend-architecture)). There are no URLs and no deep links.
- **State management:** React context over a pure reducer — no Redux, no
  external state library. Detail below.
- **Styling:** plain CSS custom properties in `src/styles/archive-theme.css`.
  No CSS-in-JS, no utility framework, no component library.
- **Service layer:** `lib/` holds every adapter (storage, image, analysis,
  product-match, candidates). Components never talk to a browser API directly.

### Views

| View | Component | Purpose |
| --- | --- | --- |
| Studio | `StudioScene.tsx` | The room; entry point and navigation hub |
| Closet | `ClosetPanel.tsx` | Archive grid with category + tag filtering |
| Lookbook | `LookbookView.tsx` | Pieces as a collection with reference details |
| Mirror | `MirrorPreview.tsx` + `MannequinPreview.tsx` | 2.5D layered composition + Fit Check |
| Outfits | `OutfitWallBoard.tsx` | Saved looks board |
| Proxy 3D | `Proxy3DLab.tsx` | Experimental; hidden unless flag-enabled |

**Every view renders live provider data.** No screen uses mock or hard-coded
garments. The procedural sample archive (`data/seedGarments.ts`) is reachable
only through an explicit "Load sample" action.

### State layer


`src/app/providers/`

- **`archiveReducer.ts`** — a pure reducer. State = `{ garments,
  currentOutfit, savedOutfits, events, lastEvent, hydrated }`. Non-deterministic
  values (ids, timestamps, events) arrive via action payloads, so the reducer is
  fully testable. `sanitizeOutfit()` enforces the invariant *"every filled slot
  references an existing garment whose category equals that slot"* wherever
  garments and selection change underneath each other.
- **`archiveContext.ts`** — the context object + `ArchiveContextValue` shape.
- **`ArchiveProvider.tsx`** — wraps the reducer with action creators (which mint
  ids/timestamps/events) and wires persistence.
- **`useArchive.ts`** — the consumer hook.

### Persistence flow

1. On mount, the provider resolves a storage adapter **and the asset blob store**,
   loads garments / saved outfits / current outfit, **resolves any blob-backed
   garment's display image to an object URL** (`hydrateGarmentForRuntime`), and
   dispatches `HYDRATE` (which sets `hydrated`).
2. Three effects persist each slice — **gated on `hydrated`** so the initial
   empty state never overwrites stored data before the async load resolves. The
   garments effect runs `dehydrateGarmentForStorage` so blob-backed garments
   persist lightweight metadata (refs + thumbnail), not the heavy image strings.
3. Garment delete cleans the garment's blobs; reset clears the blob store; saved
   outfits hold IDs only, so outfit delete never touches image data.
4. **Orphan sweep (Phase 12, cross-tab-hardened in 12.5)** — before `HYDRATE`
   exposes the UI, the provider freezes a snapshot of stored blob keys. After
   hydrate, a **fire-and-forget** `cleanupOrphanBlobs` deletes snapshot keys NOT
   referenced by a current garment, reclaiming bytes left by a failed metadata
   save. New uploads can't enter that snapshot. Four keep-conditions, all biased
   to **under-deletion** (an orphan is wasted space — the thumbnail keeps the
   garment intact — while over-deletion would lose a user's crop/cutout):
   - the **frozen snapshot** (this tab's in-flight upload is never a candidate);
   - a **referenced** blob is never deleted (read live; a thrown read aborts);
   - **age gate (12.5):** each blob key embeds its creation time
     (`asset_<ms>_<uuid>`); a candidate is deleted only if **older than ~1 h**, so a
     sibling tab's just-written, not-yet-visible blob is kept, as is a legacy
     timestamp-less key;
   - the sweep runs **only on an `ok` metadata read** — an `unavailable`/corrupt
     read (`loadGarmentsResult`) skips cleanup, so a failed read can't be mistaken
     for "no garments" and delete referenced blobs.
   Because the thumbnail is always kept, this is disk hygiene, not data-loss
   prevention.

### Mannequin preview approach


`MannequinPreview.tsx` renders a tall **faceless SVG silhouette** with the
current outfit mapped onto body zones (`torsoOuter`, `torso`, `legs`, `feet`,
`accessory`) as framed, matted **garment panels** — an editorial *collage*, not
a simulated "worn" garment. Each panel uses `mix-blend-mode: multiply` against a
light matte so white flat-lay backgrounds drop out cheaply, without needing the
optional cutout step. **Category layer presets** (`domain/garmentLayout.ts`)
drive the per-zone presentation: `fit` (`contain` for wide/odd pieces like shoes
and accessories so they are not over-cropped, `cover` for body garments) and
`zIndex` stacking. The raw zone **geometry stays in CSS** (`.zone-*`, eyeball-
verified) — the preset is the single source of truth for the semantic layer, not
duplicated percentages. (Stacking keeps the top in front of outerwear: the top's
panel sits inside the opaque outerwear panel, so true outerwear-above-top is
deferred to the cutout era, where transparent garments make the overlap readable.) The **Mirror view** reflects the same composition and
adds a caption beneath the glass — selected category chips, a layer count, a
`silhouetteHint` (a pure, composition-framed "next layer" line), and an honest
"2.5D layered styling preview" label — so the mirror reinforces the outfit
rather than reading as decorative glass.

This is intentionally **2.5D**. It is not, and is never described as, real 3D
try-on, cloth simulation, or accurate body fitting.

## 4. Backend Architecture

There is **no backend for wardrobe data**. The two services below are optional
and additive.

### `api/` — Vercel Edge functions (optional)

Three independent handlers, each a **thin HTTP orchestration wrapper**: query
building, response parsing, validation and URL guarding all live in unit-tested
modules under `src/lib/`, which the handlers import. The handlers themselves do
request/response plumbing — reading the body, obtaining an OAuth token, shaping
the reply — and delegate the logic.

| Route | Purpose | Enabled by |
| --- | --- | --- |
| `api/product-meta` | Parse a pasted product page's declared metadata (JSON-LD / OpenGraph) | `VITE_API_BASE` |
| `api/analyze` | Draft garment metadata from the thumbnail via a Claude vision model | `VITE_API_BASE` + `VITE_ANALYZER=vision` + consent gate |
| `api/candidate-search` | Reference candidates via the eBay Browse API | `VITE_API_BASE` + `VITE_CANDIDATES=search` |

### `backend/` — FastAPI (experimental)

A local-only Python service. Two surfaces:

| Route | Purpose | Consumed by |
| --- | --- | --- |
| `POST /api/proxy-3d` + status/result GETs | PNG → proxy-3D GLB, generated synchronously | The Proxy 3D Lab, when flag-enabled |
| `POST /api/jobs` + status/result GETs | Async avatar build over five injectable stage Protocols | **Nothing.** No frontend calls it. |

Layout: `main.py` (routes + response models), `proxy3d/` (validate → decode →
mask → mesh → GLB), `pipeline/` (stage Protocols, runner, procedural mannequin
builder, bbox outfit fitter, deterministic stubs), `storage.py` / `jobs.py`
(per-job disk storage).

### `api/` vs `backend/` — why both exist

They are not duplicates and neither is legacy:

| | `api/` | `backend/` |
| --- | --- | --- |
| Language / runtime | TypeScript, Vercel Edge | Python, uvicorn on localhost |
| Purpose | Optional metadata lookups for the wardrobe | Experimental mesh generation |
| Routes | `analyze`, `product-meta`, `candidate-search` | `proxy-3d/*`, `jobs/*` |
| Deployable | Yes (never deployed) | No — local only |
| Shares code with the other | No | No |

The only **direct cross-tree source import** is `api/*.ts` importing pure
modules from `src/lib/` — see [§12](#12-key-technical-decisions). There is of
course deliberate *runtime* coupling: the frontend calls the Edge functions
through `backendClient.ts` and the FastAPI service through `proxy3dApi.ts`, and
`vite.config.ts` proxies `/api` to the latter in dev.

### API routing — three runtimes, one prefix


This is the single most confusing thing in the repository, so it is worth being
explicit. Two different servers can answer paths beginning with `/api`, and they
are unrelated.

| | Web app (`src/`) | Edge functions (`api/`) | Local backend (`backend/`) |
| --- | --- | --- | --- |
| Runtime | Browser | Vercel Edge | Python / uvicorn on `127.0.0.1:8000` |
| Reached by | — | **Absolute** URL: `${VITE_API_BASE}/api/...` | **Relative** path: `/api/proxy-3d` |
| Enabled by | always | `VITE_API_BASE` alone for `product-meta`; **plus** `VITE_ANALYZER=vision` for `analyze` and `VITE_CANDIDATES=search` for `candidate-search` | `VITE_ENABLE_EXPERIMENTAL_3D` + the service running |
| Runs under `npm run dev`? | yes | **no** — needs `vercel dev` or a deployment | yes, via the Vite proxy |

The Edge functions are their own compilation unit (`tsconfig.api.json`, run by
`npm run typecheck`) because they target a server runtime, not the browser
bundle the root `tsconfig.json` describes.

The Vite dev server proxies `/api` → `http://127.0.0.1:8000`
(`vite.config.ts`). That proxy exists purely so the Proxy 3D Lab's relative
requests reach the local FastAPI service same-origin, with no CORS setup.

Because the Edge functions are addressed by an **absolute** URL built from
`VITE_API_BASE` (`lib/ai/backendClient.ts`), they never collide with that proxy:
if you point `VITE_API_BASE` at a deployment, those calls leave the dev server
entirely. The collision you *could* create is pointing `VITE_API_BASE` at
`http://localhost:5173` — then `/api/analyze` would be proxied to FastAPI, which
does not serve it. Point it at your Vercel origin instead.

### Analysis flow — mock by default, vision by opt-in


`runGarmentAnalysis` routes through the factory in `lib/ai/createAnalyzer.ts`
rather than binding an implementation directly:

- **Default (no env):** `lib/ai/mockGarmentAnalysis.ts` returns a
  **deterministic** guess from the file name (keyword tables for
  category/colour) plus an optional dominant colour and a hash for
  tags/confidence. No network, no canvas — it runs anywhere.
- **`VITE_API_BASE` *and* `VITE_ANALYZER=vision`:** the backend analyzer POSTs
  the downscaled thumbnail to `api/analyze` and normalizes the response with
  `parseVisionGuess` (`source: 'vision-api'`).

The two conditions are ANDed deliberately: setting an API base for the
product-metadata lookup must not silently start sending photos. Sending a photo
additionally requires the session-scoped consent gate in `lib/ai/visionConsent.ts`
(stored in `sessionStorage`, so it resets when the tab closes), and the upload
scan copy switches to wording that states the photo goes to a server.

Any failure — no image, network error, unparseable result — falls back to the
mock and keeps `source: 'mock'`, so a configured-but-broken backend degrades
instead of blocking an upload. Whichever path ran, the result is a **draft the
user confirms**; it is never binding.

The same `BackendClient` transport serves `api/product-meta` (URL metadata
prefill) and `api/candidate-search` (reference candidates, behind
`VITE_CANDIDATES=search`).

### Experimental 3D — the core/experimental boundary


The Proxy 3D Lab (`src/components/avatar/`) is a research track, gated at build
time by `VITE_ENABLE_EXPERIMENTAL_3D`. `src/lib/featureFlags.ts` exposes
`isExperimental3dEnabled(env)` — a pure function over an injected env slice,
matching the `resolveApiBase` / `selectAnalyzerKind` seams — and the flag reaches
the UI through exactly three points in `ArchiveStudio.tsx`:

1. `visibleViewOrder(enabled)` (`components/studio/views.ts`) drops `'lab'` from
   the navigation, which is what the sidebar renders.
2. `onProxy3d` is not passed to `ClosetPanel`, so no card offers a 3D action —
   and `GarmentCard` ties its saved-preview badge to that same callback, so a
   surface never advertises a preview it cannot open.
3. The `'lab'` case returns `null` defensively.

Because three.js is only ever reached through the dynamic `import()` inside
`GlbViewer.tsx`, never mounting the lab is sufficient to guarantee it is never
loaded. The flag governs **reachability only**: `GarmentItem.proxy3dPreview` is
never read, written, or cleared by it, so toggling it in either direction is
lossless for stored data.

The lab talks to `backend/` over `/api/proxy-3d`. The backend also exposes an
async `/api/jobs` surface (procedural mannequin builder + bbox outfit fitter
behind five injectable stage Protocols) that **no frontend code consumes** —
see [`AVATAR_TRACK.md`](AVATAR_TRACK.md).

## 5. Data Model


`src/domain/`

| Type | File | Notes |
|------|------|-------|
| `ClothingCategory` | `garmentTypes.ts` | `outerwear \| top \| pants \| shoes \| accessory` |
| `GarmentItem` | `garmentTypes.ts` | A stored piece. `imageDataUrl` is always a downscaled thumbnail. |
| `GarmentAsset` | `garmentTypes.ts` | Optional image-asset bundle (display/original/**cropped**/reference URLs + `assetMode`). Backward compatible — legacy garments fall back to `imageDataUrl`. |
| `GarmentLayerPreset` | `garmentLayout.ts` | Per-category mannequin layer preset (`anchor` / `scale` / `zIndex` / `fit` / `aspectHint`). Semantic layer info; zone geometry stays in CSS. |
| `GarmentDraft` | `garmentTypes.ts` | Editable subset used by forms. |
| `OutfitSelection` | `outfitTypes.ts` | `Record<slot, garmentId \| null>`. One slot per category. |
| `SavedOutfit` | `outfitTypes.ts` | Named snapshot of a selection + cover hue. |
| `ArchiveEvent` | `archiveTypes.ts` | Activity event; drives the "entering the rail" flourish. |
| `GarmentAnalysisGuess` | `lib/ai/garmentAnalysisTypes.ts` | A non-binding draft, tagged with its `source` (`mock` by default, `vision-api` when opted in). |
| `FitCheckResult` | `fitCheck.ts` | Pure read on palette/tone/style. |
| `ProductMatchCandidate` | `lib/productMatch/` | A local **demo/reference** candidate — no real search or recognition. |

`garmentTaxonomy.ts` is the single source of truth for category metadata
(labels, mannequin body zone, hints), the curated color palette, and style-tag
suggestions. Editor, mock AI, seed data, cards, and the mannequin all read it.

There is **no `User` entity**, no `Account`, and no server-side schema — the
archive belongs to the browser profile it lives in. `Outfit` exists as
`SavedOutfit` (a named snapshot of garment ids). `Accessory` is not a separate
entity: it is one of the five `ClothingCategory` values.

## 6. Wardrobe Item Flow

### Upload flow


`UploadGarmentModal.tsx`

```
pick / drop file
  → validate (type, size)
  → processImageFile()   read → downscale to thumbnail → sample dominant color
  → runGarmentAnalysis() mock guess from filename + dominant color
  → review: demo scan → draft-metadata suggestion + editable fields
                        (name required; user confirms)
  → addGarment()   creates the Archive Piece
  → "Archive Piece created" moment, then enters the rail (with an "archiveIn"
    flourish), closet, and room
```

The mock suggestion is **never binding** — the user confirms or edits before
saving, and a name is required. Flow logic lives in the pure `uploadFlow` reducer
(`UploadState`), a small state machine:

```
idle → scanning → crop → cutout → review → reference → archiving → archived
scanning → error                                       (undecodable / corrupt image)
any → idle                                             (reset / close / discard)
```

The `crop` step (Phase 9) is a skippable **"Prepare display asset"** beat — a
manual crop over the uploaded photo (zoom + pan sliders) that produces a cleaner
2D garment asset. "Use crop" sets `croppedImageUrl` + `displayImageUrl` +
`assetMode: 'cropped'`; "Use original" keeps `assetMode: 'uploaded'`.

The `cutout` step (Phase 10) is a skippable, **opt-in local background removal**
pass ("Prepare cutout"). It is a REAL on-device edge-seeded flood fill
(`lib/image/garmentCutout.ts`) — **not** ML segmentation, cloud AI, product
recognition, or 3D. It shows a before/after preview; accepting sets
`cutoutImageUrl` + `displayImageUrl` + `assetMode: 'cutout'`. It is non-blocking:
a busy background returns `unavailable` and a decode/canvas problem returns
`failed`, both of which keep the flow moving ("Continue without cutout"). Nothing
leaves the device.

Persistence happens at **confirm** (before any timer), so the celebratory
"Archive Piece created" beat is purely visual — a mid-celebration close still
saves. `UPLOAD_COPY` centralizes the user-facing copy and is guarded by an
honesty test (nothing implies real AI / 3D).

### Garment asset pipeline (Phase 8)

The optional **`reference` step** sits between review and archiving: the user can
attach local **demo reference candidates** (`mockProductMatch` — no real search
or recognition) or manual product details, and choose the archive **display
image** (the uploaded photo, or a reference image URL they provide). It is
**skippable** — confirming with no edits keeps `assetMode: 'uploaded'`.

Every new garment is created with a `GarmentAsset`, and **every UI surface
renders `getGarmentDisplayImage(garment)`** — `asset.displayImageUrl` →
`asset.cutoutImageUrl` → `asset.croppedImageUrl` → `asset.originalImageUrl` →
`imageDataUrl`. Pre-Phase-8 garments (which only have `imageDataUrl`) still render
unchanged. The helper is defensive (tolerates a missing/empty/malformed asset).

> **Precedence (Phase 10).** `displayImageUrl` is the single source of truth for
> what renders: it ALWAYS holds the user's latest *intentional* display choice,
> kept in lockstep with `assetMode` (`uploaded` → raw, `cropped` → the crop,
> `cutout` → an **accepted** cutout, `product-reference` → a user-picked
> reference). A generated cutout is NEVER auto-applied — it only becomes the
> display when the user accepts it. That is why `displayImageUrl` ranks above
> `cutoutImageUrl`: a stale or unaccepted cutout can never silently override an
> explicit product-reference (Phase 8) choice. Everything after `displayImageUrl`
> is a defensive fallback for malformed/legacy records. `assetMode` is, in
> effect, the explicit display-source preference field.

Phase 9 added the first asset-preparation step (a **manual crop** —
`lib/image/cropGeometry.ts` pure math + `lib/image/cropImage.ts` canvas, producing
`croppedImageUrl`). Phase 10 added the first real **background removal**
(`lib/image/garmentCutout.ts`, producing `cutoutImageUrl`). Both work from the
already-downscaled, quota-safe thumbnail. This `GarmentAsset` remains the
foundation for future 3D assets and real product search — **neither of which
exists today**.

> **Storage hardening (Phase 11).** Heavy owned images (cropped/cutout) of NEW
> uploads are stored as **Blobs** in the asset blob store (when IndexedDB is
> available) and the metadata keeps only a `croppedImageRef`/`cutoutImageRef` +
> the `imageDataUrl` thumbnail. At hydration the **display** blob is resolved back
> to an object URL **keyed off `assetMode`** (so the same precedence holds — a
> stored cutout blob never shadows a chosen product reference), and a missing blob
> degrades to the thumbnail. `getGarmentDisplayImage` stays synchronous and every
> surface is unchanged. Legacy garments (no refs) are never transformed; when IDB
> is unavailable, blob-backing is skipped and data URLs persist as before.

### Outfit flow


- Selecting a garment (`selectGarment`) places it in its category slot,
  **replacing** any current pick there.
- `OutfitInspector` shows the five slots, the `FitCheck`, and saving.
- `OutfitBuilder` offers per-category quick pickers inside the Mirror view.
- `generateFitCheck()` (pure) turns the selected garments into a palette/tone/
  style read with editorial notes.
- Saved looks are snapshots; restoring sanitizes against the current garments.
  `SavedOutfitCard` renders each as an editorial card — garment thumbnails,
  category labels, a deterministic `generateFitCheck` **vibe** label (no AI),
  date, and Restore/Delete. Deleting a look removes only the look, never its
  garments; a look whose garments were since deleted renders gracefully.

## 7. Image Flow

Images never leave the device in the default configuration.

```
File (camera roll / disk)
  → validate               type + size guard (imageFileUtils.ts)
  → readFileAsDataUrl      FileReader
  → downscale              canvas, longest edge <= 768px, JPEG q~0.72
  → sample dominant colour canvas pixel pass, skipping near-white
  → OPTIONAL manual crop   cropGeometry.ts (pure math) + cropImage.ts (canvas)
  → OPTIONAL cutout        garmentCutout.ts edge-seeded flood fill
                           -> transparent WebP
  → persist                thumbnail (data URL) into metadata;
                           heavy cropped/cutout bytes as Blobs in the
                           asset blob store, referenced by key
  → render                 getGarmentDisplayImage() resolves precedence
```

**Storage split.** The thumbnail always lives inline in the garment record; the
heavy derived images live as Blobs in a second IndexedDB database, referenced by
`croppedImageRef` / `cutoutImageRef`. At hydration the display blob is resolved
to an object URL, keyed off `assetMode`. A missing blob degrades to the
thumbnail, so image loss costs quality, never a record.

**Display precedence** (`getGarmentDisplayImage`, `domain/garmentAsset.ts`):
`displayImageUrl → cutoutImageUrl → croppedImageUrl → originalImageUrl →
imageDataUrl`. `displayImageUrl` ranking first is load-bearing — see the
precedence note in [§6](#6-wardrobe-item-flow).

Object URLs are owned by the blob store, cached one per key and revoked on
delete or reset.

## 8. Authentication

**None.** There is no authentication, no user account, no session, and no
authorization layer, because there is no server holding wardrobe data. The
archive belongs to the browser profile.

The only credentials anywhere are **server-side API keys** used by the optional
Edge functions (`ANTHROPIC_API_KEY`, `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`).
They are read from `process.env`, never prefixed `VITE_`, and never reach the
client bundle. Those endpoints are currently unauthenticated — see
[§13](#13-known-architectural-limitations).

## 9. Persistence

### Storage layer


`src/lib/storage/`

- **`storageTypes.ts`** — the `ArchiveStorageAdapter` interface, storage keys,
  and defensive parsers (never throw; drop corrupt entries). `loadGarmentsResult`
  (12.5) returns an explicit `ok`/`unavailable` status so the sweep can tell an
  empty archive apart from a failed read.
- **`localStorageFallback.ts`** — JSON arrays under stable keys; quota-safe
  because images are pre-downscaled.
- **`indexedDbStorage.ts`** — a thin key/value store. The probe verifies a real
  write/read roundtrip **with a timeout**, so a stalled or blocked `open()`
  degrades instead of hanging. Every op is wrapped so failures don't crash.
- **`archiveStorage.ts`** — the facade. Selection order: IndexedDB → localStorage
  → in-memory. Exposes a memoized `getArchiveStorage()`.
- **`assetBlobStore.ts`** (Phase 11, 12.5) — a separate IndexedDB DB
  (`fit-archive-assets`) holding heavy garment image **Blobs** keyed by id, so the
  metadata array stays light. Small interface
  (`put`/`get`/`getObjectUrl`/`delete`/`listKeys`/`clear`); the store owns
  object-URL create/revoke (cached per key). `durable` is true only for the IDB
  backend; a non-durable in-memory fallback (when IDB is absent) makes blob-backing
  a no-op so a reload never loses data. `put` resolves on the transaction
  **commit**, so a ref is never attached to a blob that did not land, and (12.5)
  mints a **timestamped key** `asset_<ms>_<uuid>` (`parseBlobCreatedAt`) that powers
  the orphan-age gate — no record/schema change, no DB version bump.
- **`garmentAssetStorage.ts`** (Phase 11–12) — the metadata⇄blob bridge:
  `dehydrateGarmentForStorage` (drop the duplicate/blob-backed heavy strings,
  keep the thumbnail) and `hydrateGarmentForRuntime` (resolve the display blob →
  object URL, keyed off `assetMode`; missing blob → inline asset → thumbnail
  fallback). Both are **ref-conditional**: a garment with no blob ref is passed
  through untouched, so legacy/Phase 8–10 garments are unaffected.
  `blobBackDraftAsset` stores a new upload's cropped/cutout images as blobs
  (durable backend only). `garmentBlobKeys` (the **single** owned-keys source used
  by delete-cleanup AND the sweep), `archiveBlobKeys`, and `cleanupOrphanBlobs`
  (Phase 12) implement the conservative orphan sweep.

## 10. External Services

| Service | Used by | When |
| --- | --- | --- |
| Anthropic Messages API | `api/analyze.ts` | Only with `VITE_ANALYZER=vision` + `VITE_API_BASE` + consent |
| eBay Browse API | `api/candidate-search.ts` | Only with `VITE_CANDIDATES=search` + `VITE_API_BASE` |
| Arbitrary product pages | `api/product-meta.ts` | Only with `VITE_API_BASE`; SSRF-guarded, http(s) + public hosts only, every redirect hop re-validated |
| Google Fonts | `index.html` | Progressive, with a system-serif fallback; the app works offline |

No analytics, no telemetry, no error reporting, no cloud storage, no database
service, and no CDN for application assets — the app's own JS/CSS are served from
wherever the site is hosted. **With no environment configuration, the only
external request is the Google Fonts stylesheet and its font files.**

## 11. Deployment

**No deployment configuration, live URL, or deployment evidence exists in the
repository** — no production or staging environment, no public URL, no container
image, and no infrastructure-as-code. On that basis the project is treated as
never deployed.

What exists is the *capability*: `api/` is written for Vercel Edge, and
`.env.example` documents pointing `VITE_API_BASE` at a deployment origin. Nothing
has been provisioned. `backend/` is explicitly local-only and is not intended to
be deployed.

CI (`.github/workflows/ci.yml`) runs verification only — it does not build or
publish an artifact anywhere.

## 12. Key Technical Decisions

- **Local-first; no backend for wardrobe data.** Eliminates accounts, sync,
  and privacy exposure. Cost: no multi-device, no export yet.
- **Pure reducer with injected non-determinism.** Ids, timestamps and events
  arrive in action payloads, so the domain tests without mocking clocks. Cost:
  more verbose action creators.
- **Three-tier storage behind one adapter interface.** The app stays usable when
  IndexedDB is blocked rather than failing. Cost: the in-memory tier is silently
  non-persistent.
- **Image bytes separated from metadata, across two IndexedDB databases.** Keeps
  the metadata array light and quota-safe. Cost: an orphan-blob sweep is needed,
  which is why it is deliberately fail-closed.
- **Independent env flags per network path, ANDed where it matters.** The
  product-URL lookup needs `VITE_API_BASE` alone; the vision and candidate paths
  each need a *second* flag on top of it, so configuring the URL lookup can never
  silently enable photo transmission. The vision path adds a consent gate. Note
  this gating lives in frontend provider selection — a deployed handler is not
  self-gating, which is why the unauthenticated-endpoint debt matters.
- **`api/` handlers import pure modules from `src/lib/`.** One implementation of
  parsing and URL-guarding, unit-tested once, shared by the client and the Edge
  function. Cost: a build-time coupling between the two compilation units, which
  is why `tsconfig.api.json` type-checks `api/` separately.
- **three.js behind a single lazy-loading site plus a feature flag.** A 733 kB
  dependency stays out of the default visitor's session.
- **Plain CSS over a component library.** A specific editorial aesthetic is
  easier to build from tokens than to fight out of a design system.
- **Honesty enforced by tests.** `src/test/honesty.ts` exports forbidden-term
  regexes asserted against user-facing copy by seven test files.

## 13. Known Architectural Limitations

- **A backup file is the only recovery path.** Storage is browser-only, so a
  cleared profile still loses whatever has not been exported. Export/import
  exists (`archiveExport.ts` / `archiveImport.ts`, surfaced in the Closet);
  nothing reminds the user to run it on a schedule.
- **Metadata and blob writes are not transactionally coordinated.** The blob-age
  gate narrows the multi-tab window but does not close it.
- **The multi-tab revision check and the write are not one transaction.** Two
  tabs writing inside the same tick can still interleave; the window is
  milliseconds wide and both tabs then see the conflict on their next write.
  Closing it fully needs a single transaction over a store that supports one —
  IndexedDB does, localStorage does not.
- **Only the downscaled thumbnail is retained** — the original full-resolution
  photo is discarded at upload.
- **The optional Edge functions are unauthenticated.** They are off unless
  `ENABLE_OPTIONAL_APIS=true`, and now carry an origin allowlist (never a
  wildcard), a per-caller throttle, request-body caps, response-size caps and
  timeouts — but no auth, so any allowed origin can spend the API keys. The
  throttle is per Vercel isolate, which is a speed bump rather than a
  guarantee, and `urlGuard` cannot defend against DNS rebinding. Do not deploy
  them publicly with real keys without adding authentication.
- **No routing.** View state is in-memory, so there are no shareable URLs and a
  reload always returns to the Studio.
- **The mannequin is 2.5D.** Body zones are CSS geometry; nothing is fitted or
  simulated.
- **The async jobs API has no consumer**, so its design is unvalidated by real
  use.

## 14. Planned Architecture

Everything in this section is **planned or exploratory — none of it exists.**


- **A different analysis provider** — implement `GarmentAnalyzer` and add a case
  to `createAnalyzer`; `runGarmentAnalysis` and every caller stay unchanged.
- **Background removal / cutout** — implemented (Phase 10): `attemptGarmentCutout`
  (`lib/image/garmentCutout.ts`) is a real, local edge-seeded flood fill behind a
  swappable `CutoutDeps` adapter. To upgrade quality, drop a WASM/ML segmentation
  model into the adapter's `rasterize`/segment seam (e.g. via dynamic import) —
  the UI and the `CutoutResult` contract don't change. The asset's
  `cutoutImageUrl` and the panels' transparency support are already wired.
- **Asset blob storage** — exists (Phase 11) and hardened (Phase 12):
  `assetBlobStore.ts` is an IndexedDB Blob-per-record store; new uploads'
  cropped/cutout images are blob-backed when durable storage is available, with
  data-URL fallback otherwise and legacy garments untouched. **Phase 12 added** a
  conservative orphan sweep (reclaims blobs from failed saves) and confirmed the
  store-owned object-URL lifecycle (cached one-per-key, revoked on delete/reset).
  **Phase 12.5** narrowed the cross-tab sweep race with a blob-age gate +
  explicit metadata-read status. Remaining future work: **fully atomic** /
  transactionally-coordinated metadata+blob writes (writes are acknowledged per
  slice today, but metadata and blobs are still two independent stores; the age
  gate makes the residual multi-tab window small but not zero), a full-resolution storage strategy (today only the
  downscaled thumbnail is kept), and an ML/WASM cutout that writes through the
  same store.
- **3D room** — replace `StudioScene` / `MannequinPreview` with an R3F scene;
  the domain + state layers are renderer-agnostic.
- **A mobile client** — `domain/` and the pure half of `lib/` port as-is; the
  browser-bound adapters are enumerated in
  [`MOBILE_MIGRATION.md`](MOBILE_MIGRATION.md).
