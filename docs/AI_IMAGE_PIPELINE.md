# AI Image Pipeline (current + future)

The app is built around a clean seam for image analysis. **By default there are
no network or model calls** — analysis is a deterministic local mock. The seam is
now wired (Track A Phase 4): when the operator sets `VITE_ANALYZER=vision` and
`VITE_API_BASE`, `createAnalyzer.ts` selects a backend analyzer that POSTs the
downscaled thumbnail to the `api/analyze` Vercel function (a Claude vision call)
and maps the result via `parseVisionGuess` (`source: 'vision-api'`); any failure
falls back to the mock. The default (env unset) remains mock-only with no upload.

> **Note on "Phase" numbers — they collide.** PLAN.md's roadmap and this document
> both say "Phase N" but mean different things. **PLAN.md Phase 3 ("Upload To
> Archive Transition")** is a *UX illusion*: a premium demo-scan → draft-metadata
> suggestion → "Archive Piece created" → transition ritual layered over the
> existing **local mock**. It is NOT this document's *future* "Phase 3 (real
> Vision provider)". **No real AI / vision recognition or 3D try-on is
> implemented** — the analyzer is still `mockGarmentAnalysis`, and the upload copy
> is deliberately worded as a *local demo* (see `uploadFlow.ts` `UPLOAD_COPY`,
> guarded by an honesty unit test). (Local **background removal** shipped later in
> Phase 10 — a real on-device edge flood fill, not AI/ML; see below.)

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

## Product / reference matching (Phase 8 — demo by default, optional real search)

The upload flow has an optional **reference step**. By default it uses
`mockProductMatch` (`src/lib/productMatch/`), which returns local **demo
reference candidates** derived from the draft's category/color/tags — no
network, no recognition. When server-side eBay keys (`EBAY_CLIENT_ID` /
`EBAY_CLIENT_SECRET`, never `VITE_`-prefixed) are configured, the
`api/candidate-search` function queries eBay's Browse API and returns real
**reference candidates** (title/brand/image/link) instead; with the keys unset
the endpoint reports "not configured" and the front end stays on the mock.

Either way, nothing is auto-matched: no product is recognized or verified,
nothing is stored on the user's behalf, a manual-entry candidate is always
offered first, and the user confirms or edits everything.

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
is also the storage seam a future ML/WASM cutout would reuse. This `GarmentAsset`
remains the **foundation** for future 3D/GLB assets — a garment can already carry
an optional `proxy3dPreview` link (Track B, B3.9), but that is metadata only
(a job id + honest generation notes; the GLB stays in the local backend's job
storage and is deliberately **not** in `garmentBlobKeys`). No garment-owned GLB
asset is produced or stored by Track A today.

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

## Future pipeline (later roadmap phases — real analysis, NOT yet built)

```
File
  → create preview (as today)
  → OPTIONAL manual crop          (Phase 9: SHIPPED — local crop → croppedImageUrl)
  → OPTIONAL background removal   (Phase 10: SHIPPED — local edge flood fill →
                                   transparent WebP cutoutImageUrl. A WASM/ML
                                   segmentation model can replace the adapter for
                                   higher quality without changing the contract.)
  → AI analysis                   (future: real Vision provider)
        • category, color, material
        • style tags
        • brand / logo recognition
  → user confirmation             (still required — guesses stay non-binding)
  → archive save                  (Phase 11: SHIPPED — thumbnail in metadata +
                                   cropped/cutout Blobs in the IDB asset store;
                                   full-res Blob storage is still future)
  → transition into the room      (existing archiveIn flourish)
  → mannequin layer mapping       (category → body zone, as today)
```

A real provider could also offer **garment cutout generation** (segmentation →
transparent PNG) feeding the body-zone mapping. Further out (beyond image
analysis): a **3D / GLB mannequin in a React Three Fiber room** would replace the
CSS studio scene (see `docs/ROADMAP.md`), and a research prototype could explore
genuine virtual try-on. **Neither exists today, and the app never claims they
do.** What does exist is Track B's separate Proxy 3D Lab, which renders GLBs the
local `backend/` service generates — an explicitly labeled **proxy** (extruded
silhouette card, procedural faceless mannequin, bounding-box outfit alignment,
pass-through texture projection). It is not part of this pipeline, does not touch
the studio scene, and is not try-on. See `docs/AVATAR_TRACK.md`.

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
