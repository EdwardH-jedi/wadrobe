> **Historical document — not current implementation status.**
> Kept for the reasoning it records. It was accurate when written and has not
> been maintained since. For what the repository actually contains today, see
> [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md).

---

# Roadmap — The Archive

The Archive is a **premium interactive fashion archive MVP**: upload real clothing
photos, archive them with a **local demo** classification you confirm, browse a
curated closet, style a tall faceless **2.5D** mannequin / mirror preview, run a
Fit Check, and save looks to an editorial board — all persisted locally, in a
dark editorial UI.

It does **not** (yet) perform real AI product recognition, real 3D virtual
try-on, cloth simulation, backend sync, auth, or cloud storage. Phase numbering
here matches `PLAN.md`.

## Delivered phases

### Phase 1 — Archive MVP / core data flow ✅
Garment domain types; upload → garment; hydration-gated persistence
(IndexedDB → localStorage → memory); edit/delete; outfit selection by category
with replacement; save/restore/delete looks. Pure reducer + provider.

### Phase 2 — Clothes visually central ✅
Sidebar + studio scene + bottom filmstrip + outfit inspector; larger garment
thumbnails throughout; the studio mannequin as the hero; an in-scene empty prompt.

### Phase 3 — Upload-to-archive ritual ✅
A demo scan → draft-metadata suggestion → confirm/edit → "Archive Piece created"
→ transition into the rail/closet, over the local mock. **Phase 3.5:**
corrupted-image rejection + required-name validation.

### Phase 4 — Mannequin & mirror preview ✅
Tall faceless **2.5D** mannequin with garment panels mapped to body zones; a
Mirror composition caption (category chips, layer count, silhouette hint, and an
honest "2.5D layered styling preview" label).

### Phase 5 — Saved outfit board ✅
Editorial saved-look cards: garment thumbnails, a deterministic vibe label,
category labels, date, Restore/Delete; an intentional empty board.

### Phase 6 — Architecture & documentation hardening ✅ (this pass)
Docs reconciled with the implementation; honest AI/3D wording throughout;
`docs/CODEX_REVIEW.md` created.

### Phase 7 — Codex review preparation ✅
The external-review handoff (`docs/CODEX_REVIEW.md`) and a full Codex MVP review
(PASS WITH WARNINGS, no must-fix items).

### Phase 8 — Product match & garment asset pipeline ✅
A `GarmentAsset` model (display / original / reference images + `assetMode`)
behind a `getGarmentDisplayImage` helper used by every render surface, plus an
optional, skippable product/reference step (`mockProductMatch`) in the upload
flow. The **foundation** that Phases 9–10 built on (crop, cutout) and that future
3D assets will use — product/reference matching itself stays **local demo only**,
with no real search or recognition.

### Phase 9 — Garment asset compiler / clean 2D asset pipeline ✅
The first real browser image-processing foundation: a skippable **manual crop**
("Prepare display asset") step in the upload flow (zoom/pan sliders →
`croppedImageUrl`, pure `cropGeometry.ts` math + `cropImage.ts` canvas, quota-safe
JPEG from the downscaled thumbnail), category-based **mannequin layer presets**
(`garmentLayout.ts` — `anchor`/`scale`/`zIndex`/`fit`), and a cutout seam
(`garmentCutout.ts`, then a stub — filled by Phase 10).

### Phase 10 — Real local background removal / cutout ✅
A **real, on-device, experimental** background remover (`garmentCutout.ts`): an
edge-seeded flood fill behind a swappable `CutoutDeps` adapter that turns a
uniform flat-lay background transparent → a quota-light WebP `cutoutImageUrl`. An
opt-in **"Local background removal"** step shows a before/after preview; accepting
sets `assetMode: 'cutout'`. It is **NOT** ML segmentation, cloud AI, product
recognition, or 3D; cutout **quality varies** with the photo background; it is
**non-blocking** (`unavailable`/`failed` never stall the flow) and fully
skippable. `displayImageUrl` + `assetMode` hold the latest intentional choice, so
a stored cutout never shadows a chosen product reference.

## Future phases — NOT yet built (do not imply these exist)

### Future — Higher-quality cutout + storage hardening
Upgrade cutout quality with an on-device **WASM/ML segmentation** model dropped
into the existing `CutoutDeps` adapter (kept optional/lazy so startup never
depends on it). Plus **full-resolution image Blobs** in a dedicated IndexedDB
object store (thumbnails stay in metadata records) and smarter dominant-color /
palette extraction. The current Phase-10 cutout is a classic flood fill — real,
but limited to clean flat-lay backgrounds; ML segmentation is the quality path.

### Future — Real Vision API / product recognition
Replace `mockGarmentAnalysis` with a real `GarmentAnalyzer` (e.g. Anthropic Claude
vision, Google Cloud Vision, or a hosted model): real category/color/material and
brand/logo recognition, optional candidate search. The "user confirms before
save" step stays; the UI contract (`GarmentAnalysisGuess`) is stable. See
`docs/AI_IMAGE_PIPELINE.md`. Requires explicit user consent before any photo
leaves the device, plus a local-only fallback.

### Future — Three.js / React Three Fiber room
Replace the CSS studio scene with a real 3D showroom (R3F): lit room, physical
materials (walnut, chrome, concrete), camera moves between zones; a 3D/GLB
mannequin with garment textures on body regions. The domain + state layers are
renderer-agnostic, so this is a presentation swap, not a rewrite.

### Future — Virtual try-on research / prototype
Research genuine garment-on-body rendering (pose estimation, cloth warping, or
diffusion-based try-on) behind a clearly-labeled experimental flag. Describe it
as "real try-on" **only once it actually is** — until then the app remains an
explicit 2.5D styling composition.

## Cross-cutting (any phase)

- Optional cloud sync / accounts (currently out of scope).
- Export / share a look as an editorial image.
- Outfit suggestions from the Fit Check heuristics.
- Accessibility and reduced-motion audits.
