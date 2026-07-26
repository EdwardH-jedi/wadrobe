# Architecture — The Archive

This document explains how the MVP base is put together and where to extend it.

## Stack

- **Vite + React 18 + TypeScript** (strict mode).
- **Plain CSS** with design tokens (`src/styles/`). No CSS-in-JS, no utility
  framework.
- **Vitest + Testing Library + jsdom** for tests. **ESLint 9** (flat config).
- Runtime dependencies: `react`, `react-dom`, and `three`. `three` exists only
  for Track B's Proxy 3D Lab GLB viewer and is reached through a **dynamic
  import inside that component**, so the closet app's bundle and startup never
  pay for it — keep it that way. (Editorial fonts load progressively from Google
  Fonts with a system fallback; the app works offline.)
- This document covers the **closet layer** (Track A). The optional serverless
  functions in `api/` are off unless `VITE_API_BASE` is configured, and the
  local-only FastAPI service in `backend/` is a separate track documented in
  `docs/AVATAR_TRACK.md`. Neither is a dependency of anything below.

## Layering

Dependencies point strictly downward:

```
components/  (React UI)
   │
app/providers/  (ArchiveProvider — context + reducer + persistence effects)
   │
lib/  (storage, ai, image, color, id, cx, format)
   │
domain/  (pure types + pure logic: taxonomy, fitCheck, drafts)
```

`domain/` and most of `lib/` are framework-free and unit-testable in isolation.

## Domain models

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
| `GarmentAnalysisGuess` | `lib/ai/garmentAnalysisTypes.ts` | Non-binding mock guess (no real AI). |
| `FitCheckResult` | `fitCheck.ts` | Pure read on palette/tone/style. |
| `ProductMatchCandidate` | `lib/productMatch/` | A local **demo/reference** candidate — no real search or recognition. |

`garmentTaxonomy.ts` is the single source of truth for category metadata
(labels, mannequin body zone, hints), the curated color palette, and style-tag
suggestions. Editor, mock AI, seed data, cards, and the mannequin all read it.

## State layer

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

## Storage layer

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

## Upload flow

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

## Outfit flow

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

## Mock analysis flow (no real AI)

`lib/ai/mockGarmentAnalysis.ts` returns a **deterministic** guess from the file
name (keyword tables for category/color) plus an optional dominant color and a
hash for tags/confidence. It performs no network or canvas work, so it runs in
any environment. The `GarmentAnalyzer` interface is the seam for a real provider.

## Mannequin preview approach

`MannequinPreview.tsx` renders a tall **faceless SVG silhouette** with the
current outfit mapped onto body zones (`torsoOuter`, `torso`, `legs`, `feet`,
`accessory`) as framed, matted **garment panels** — an editorial *collage*, not
a simulated "worn" garment. Each panel uses `mix-blend-mode: multiply` against a
light matte so white flat-lay backgrounds drop out without real background
removal (a future phase). **Category layer presets** (`domain/garmentLayout.ts`)
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
try-on, cloth simulation, or accurate body fitting. The GLB rendering that does
exist lives entirely in Track B's Proxy 3D Lab (`src/components/avatar/`) and is
labeled a **proxy** there; it does not feed this preview.

## Future extension points

- **Real AI** — implement `GarmentAnalyzer`, swap behind `runGarmentAnalysis`.
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
  transactionally-coordinated metadata+blob writes (today persistence is
  fire-and-forget, app-wide; the age gate makes the residual multi-tab window
  small but not zero), a full-resolution storage strategy (today only the
  downscaled thumbnail is kept), and an ML/WASM cutout that writes through the
  same store.
- **3D room** — replace `StudioScene` / `MannequinPreview` with an R3F scene;
  the domain + state layers are renderer-agnostic. Not built: the studio scene
  is still CSS. `three` is already a dependency (for Track B's GLB viewer), so
  this would not add one — but it would move `three` onto Track A's startup
  path, which is exactly what the dynamic-import rule currently prevents.
