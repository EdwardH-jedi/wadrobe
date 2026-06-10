# Skill: ai-image-pipeline

How garment image analysis is wired, and how to extend it. Full detail:
`docs/AI_IMAGE_PIPELINE.md`.

## Today (Phase 1) — mock only

- **No** network or model calls. `runGarmentAnalysis()` in
  `src/lib/ai/mockGarmentAnalysis.ts` returns a **deterministic** guess from the
  filename (keyword tables for category/color) + an optional dominant color +
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

## To add a real Vision provider (Phase 3)

1. Implement `GarmentAnalyzer.analyze()` to POST image bytes and map the
   response to `GarmentAnalysisGuess` (`source: 'vision-api'`).
2. Pass the downscaled image (data URL / Blob) from `UploadGarmentModal`, not
   just filename hints.
3. Choose the analyzer behind `runGarmentAnalysis` via a feature flag.
4. Keep the confirmation step. Surface `confidence`; let the user fix any field.
5. Add user consent before sending photos off-device; keep a local-only mode.

## Guardrails

- Never fabricate a brand in the mock (real brand recognition is future).
- Never store full-resolution images in localStorage (quota). Thumbnails stay in
  metadata; heavier cropped/cutout images of new uploads go to the IndexedDB asset
  blob store (`lib/storage/assetBlobStore.ts`, Phase 11) with data-URL fallback.
  Full-resolution Blob storage (vs. the thumbnail) remains future work.
- Don't claim the pipeline does more than it does.
