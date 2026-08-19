# AI Image Pipeline (current + future)

The app is built around a clean seam for image analysis. **By default there are
no network or model calls** — analysis is a deterministic local mock. The seam is
now wired (Track A Phase 4): when the operator sets `VITE_ANALYZER=vision` and
`VITE_API_BASE`, `createAnalyzer.ts` selects a backend analyzer that POSTs the
downscaled thumbnail to the `api/analyze` Vercel function (a Claude vision call)
and maps the result via `parseVisionGuess` (`source: 'vision-api'`); any failure
falls back to the mock. The default (env unset) remains mock-only with no upload.

> **What is and is not real, precisely.**
>
> - The **default** analyzer is `mockGarmentAnalysis` — deterministic, on-device,
>   no network. This is what a clone runs.
> - The **optional** vision analyzer is implemented and reachable only when
>   `VITE_API_BASE` **and** `VITE_ANALYZER=vision` are both set, plus a
>   session-scoped consent gate. It produces a *draft* the user still confirms.
> - **Background removal** is a real on-device edge flood fill — not AI, not ML,
>   not segmentation. See below.
> - **No 3D try-on exists.** The mannequin preview is a 2.5D layered composition;
>   the experimental proxy-3D lab is a separate, opt-in research track
>   (`docs/AVATAR_TRACK.md`).
>
> Upload copy is deliberately worded to match whichever path is active
> (`uploadFlow.ts` `UPLOAD_COPY`, guarded by an honesty unit test).
>
> **Careful with "Phase N".** The historical roadmap in `docs/archive/PLAN.md`
> and this document both use the phrase and mean different things — that
> roadmap's "Phase 3" is a UX transition ritual, not this document's *future*
> "Phase 3 (real Vision provider)". Current status lives in
> [`CURRENT_STATE.md`](CURRENT_STATE.md), not in either numbering.

## Current pipeline (mock, on-device)

```
File (user upload)
  │
  ├─ validate            isSupportedImage / isWithinSizeLimit
  │
  ├─ readFileAsDataUrl   File → data URL (FileReader)
  │
  ├─ downscaleDataUrl    decode (REJECTS a corrupt/undecodable image-MIME file so
  │                      it is never archived as a broken image — Phase 3.5) →
  │                      canvas re-encode, longest edge ≤ 768px, JPEG q≈0.72 →
  │                      the THUMBNAIL we persist (quota-safe)
  │
  ├─ sampleDominantColorHex
  │                      24×24 canvas average, skipping near-white pixels
  │
  ├─ runGarmentAnalysis  MOCK: deterministic guess from filename keywords
  │                      + dominant color + hash (category/color/tags/conf)
  │
  ├─ manual crop         "Prepare display asset" (Phase 9): optional, local crop
  │                      (zoom/pan) of the downscaled thumbnail → croppedImageUrl
  │                      (cropGeometry.ts math + cropImage.ts canvas). Skippable.
  │
  ├─ local cutout        "Local background removal" (Phase 10): optional, opt-in
  │                      on-device edge-seeded flood fill (garmentCutout.ts) →
  │                      transparent WebP cutoutImageUrl. Skippable + non-blocking
  │                      (busy bg → unavailable, decode/canvas → failed). REAL
  │                      background removal, but NOT ML/cloud/recognition/3D.
  │
  ├─ user confirmation   "Draft metadata suggestion" (local demo); user
  │                      edits/confirms every field (never binding)
  │
  └─ addGarment          stored as an Archive Piece → "Archive Piece created"
                         moment → transition into rail / closet / room
```

Code:
- `src/lib/image/imageFileUtils.ts` — read, downscale, sample, `loadImageElement`
  (browser/canvas).
- `src/lib/image/cropGeometry.ts` — pure crop math (normalized rects, no canvas).
- `src/lib/image/cropImage.ts` — `cropImageToDataUrl` (canvas crop from the
  downscaled thumbnail, quota-safe JPEG; graceful no-op without canvas).
- `src/lib/image/garmentCutout.ts` — REAL local background removal (Phase 10):
  `attemptGarmentCutout` behind a swappable `CutoutDeps` adapter; pure
  `removeBackground` flood fill + `classifyRemoval` (canvas-free, unit-tested).
  Edge-seeded flood fill, NOT ML — honest `success`/`unavailable`/`failed`.
- `src/lib/ai/mockGarmentAnalysis.ts` — the mock analyzer.
- `src/lib/ai/garmentAnalysisTypes.ts` — `GarmentAnalysisGuess`,
  `GarmentAnalysisInput`, and the `GarmentAnalyzer` contract.

**By default the implementation performs no real product recognition, brand
identification, or vision-model inference** — it is a local deterministic mock
plus on-device canvas work, and no photo leaves the device. The optional vision
provider (Phase 4, env-gated) is the one exception: when explicitly enabled it
sends the thumbnail to the backend and the scan copy says so. It still produces a
non-binding draft the user confirms, and never fabricates a brand.

## Product / reference matching (Phase 8 — mock/demo only)

The upload flow has an optional **reference step** (`mockProductMatch` in
`src/lib/productMatch/`). It returns local **demo reference candidates** from the
draft's category/color/tags — it does **not** search the internet, recognize the
product, scrape images, or return real source candidates. A manual-entry
candidate is always offered first; the user confirms or edits everything.

Each garment carries a **`GarmentAsset`** (`src/domain/garmentTypes.ts`):
`originalImageUrl` (uploaded photo), `displayImageUrl` (what renders — via
`getGarmentDisplayImage`), plus optional `croppedImageUrl` (Phase 9 manual crop) /
`cutoutImageUrl` (Phase 10 background-removed cutout) / `thumbnailImageUrl` /
`productReferenceImageUrl` / `sourceUrl` / `sourceLabel` and an `assetMode`
(`uploaded` | `cropped` | `cutout` | `product-reference`). All four modes now
exist (`cutout` = an **accepted** local background removal). `getGarmentDisplayImage`
resolves `displayImageUrl → cutoutImageUrl → croppedImageUrl → originalImageUrl →
imageDataUrl`. **Precedence:** `displayImageUrl` holds the user's latest
intentional choice (in lockstep with `assetMode`), so a generated cutout — applied
only when the user accepts it — never silently shadows an explicit product-reference
choice; the trailing fields are defensive fallbacks. **Storage (Phase 11–12):**
new uploads store their heavy cropped/cutout images as **Blobs** in an IndexedDB
asset store (`lib/storage/assetBlobStore.ts`), keeping `croppedImageRef`/
`cutoutImageRef` + the thumbnail in metadata; the display blob is resolved to an
object URL at hydration (keyed off `assetMode`, so precedence is preserved). A
conservative, fail-closed **orphan sweep** (Phase 12, cross-tab-hardened in 12.5
with a blob-age gate + explicit metadata-read status) reclaims blobs left by a
failed save at next load while keeping recent (cross-tab) and legacy blobs. This
is also the storage seam a future ML/WASM cutout would reuse. This `GarmentAsset` remains
the **foundation** for future 3D/GLB assets and real product candidates — those are
**not yet produced**.

## Local background removal (Phase 10 — real, on-device, experimental)

`src/lib/image/garmentCutout.ts` performs **real** background removal in the
browser — but with an honest, classic algorithm, not machine learning:

1. **Rasterize** the prepared display image (crop/original) to an RGBA buffer,
   downscaled to ≤640px (quota-conscious).
2. **Sample the border** for a median background color and measure how uniform
   the border is. If the border is not a clean, uniform flat-lay background, it
   reports **`unavailable`** (it does not guess).
3. **Edge-seeded flood fill**: mark every background-colored pixel *connected to
   the border* transparent, leaving the garment — and interior regions that
   happen to match the background (e.g. a white logo) — intact.
4. **Classify**: if too little or too much was removed, report **`failed`**
   rather than ship a bad cutout. Otherwise **encode** a transparent **WebP**
   (PNG fallback) into `cutoutImageUrl`.

What it is **not**: it is **not** ML/AI segmentation, **not** cloud AI (nothing
leaves the device), **not** product recognition, and **not** 3D try-on. Cutout
quality varies with the photo background, the step is **opt-in**, and the user
can always **continue without** it. The canvas work sits behind a swappable
`CutoutDeps` adapter, so a real WASM/ML segmentation model could later replace the
rasterize/segment seam (e.g. via dynamic import) without changing the UI or the
`CutoutResult` contract.

## The full pipeline, with what is real marked

```
File
  → create preview
  → OPTIONAL manual crop          BUILT — local canvas crop → croppedImageUrl
  → OPTIONAL background removal   BUILT — local edge flood fill → transparent
                                  WebP cutoutImageUrl. Classical, not ML. A
                                  WASM/ML segmentation model can replace the
                                  adapter without changing the contract.
  → metadata analysis             BUILT, two paths:
                                    · default — the deterministic local mock
                                    · opt-in  — the cloud vision analyzer, when
                                      VITE_API_BASE + VITE_ANALYZER=vision are
                                      set and the consent gate is passed;
                                      falls back to the mock on any failure
  → OPTIONAL reference candidates BUILT — local mock by default; live search
                                  when VITE_API_BASE + VITE_CANDIDATES=search
  → user confirmation             BUILT — always required; guesses never bind
  → archive save                  BUILT — thumbnail in metadata + cropped/cutout
                                  Blobs in the IDB asset store
  → transition into the room      BUILT — the archiveIn flourish
  → mannequin layer mapping       BUILT — category → body zone
```

**Still not built**, and never claimed anywhere in the UI:

- **ML/WASM segmentation** for higher-quality cutouts. The `CutoutDeps` and
  `assetBlobStore` seams are ready for it; the model is not there.
- **Full-resolution image storage.** Only the downscaled thumbnail is kept.
- **Brand / logo recognition.** The vision analyzer fills brand only when a logo
  is unambiguous, and the mock never fabricates one.
- **A 3D / GLB room.** A React Three Fiber scene would replace the CSS studio;
  the experimental proxy-3D lab is a separate opt-in track
  (`AVATAR_TRACK.md`), not this.
- **Genuine virtual try-on.** No fitting, draping, or cloth simulation exists.

## How to add a real Vision API

1. Implement the `GarmentAnalyzer` interface:

   ```ts
   class VisionAnalyzer implements GarmentAnalyzer {
     async analyze(input: GarmentAnalysisInput): Promise<GarmentAnalysisGuess> {
       // POST the image bytes to your provider, map the response to the guess.
       // Return { category, color, colorHex, styleTags, brand?, confidence,
       //          source: 'vision-api' }
     }
   }
   ```

2. The analyzer needs the image bytes, so extend the call site in
   `UploadGarmentModal` to pass the (downscaled) data URL / Blob in addition to
   the filename hints already provided.

3. Swap the analyzer behind `runGarmentAnalysis` (e.g. choose by an env flag /
   feature toggle). **The UI and storage contracts do not change** — they only
   depend on `GarmentAnalysisGuess`.

4. Keep the confirmation step. Surface `confidence` and let the user correct any
   field before the piece is archived.

## Privacy note for future phases

Real analysis sends user photos to a third party. Before enabling it, add clear
consent and a local-only fallback. The mock path keeps everything on-device.
