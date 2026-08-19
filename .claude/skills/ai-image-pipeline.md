# Skill: ai-image-pipeline

How garment image analysis is wired, and how to extend it. Full detail:
`docs/AI_IMAGE_PIPELINE.md`.

## The default path — local mock, no network

This is what a clone runs. An optional cloud vision analyzer exists behind two
env flags (see "The optional vision provider" below); it produces a draft the
user still confirms, and falls back to this mock on any failure.

- **No** network or model calls. `runGarmentAnalysis()` routes through
  `createAnalyzer()`, which selects the mock in
  `src/lib/ai/mockGarmentAnalysis.ts`. It returns a **deterministic** guess from
  the filename (keyword tables for category/color) + an optional dominant color +
  a hash (tags/confidence).
- Image handling in `src/lib/image/imageFileUtils.ts`:
  read → **downscale to a thumbnail** (longest edge ≤ 768px, JPEG q≈0.72) →
  sample a dominant color (skips near-white pixels).
- The guess is shown as a **"Draft metadata suggestion"** (a local demo, with a
  "Demo · N%" badge). The user **must** confirm/edit (a name is required) before
  the piece is archived. Keep it non-binding, and never imply real AI.

## The seam

The contract is `GarmentAnalysisGuess` + the `GarmentAnalyzer` interface in
`garmentAnalysisTypes.ts`. UI and storage depend only on the guess shape.

## The optional vision provider — built, and off by default

`createAnalyzer.ts` selects it only when `VITE_API_BASE` **and**
`VITE_ANALYZER=vision` are both set. The two conditions are ANDed on purpose:
configuring an API base for the product-URL lookup must not silently start
sending photos.

- It POSTs the downscaled thumbnail to `api/analyze` and maps the response with
  `parseVisionGuess` (`source: 'vision-api'`).
- Sending a photo also requires the session-scoped consent gate in
  `visionConsent.ts`, and the upload scan copy switches to wording that says the
  photo goes to a server.
- Any failure — no image, network error, unusable result — falls back to the
  mock and keeps `source: 'mock'`, so a broken backend never blocks an upload.
- The confirmation step is unchanged: the guess is still a draft.

To add a *different* provider, implement `GarmentAnalyzer` and add a case to
`createAnalyzer`; nothing downstream changes.

## Guardrails

- Never fabricate a brand in the mock (real brand recognition is future).
- Never store full-resolution images in localStorage (quota). Thumbnails stay in
  metadata; heavier cropped/cutout images of new uploads go to the IndexedDB asset
  blob store (`lib/storage/assetBlobStore.ts`, Phase 11) with data-URL fallback.
  Full-resolution Blob storage (vs. the thumbnail) remains future work.
- Don't claim the pipeline does more than it does.
