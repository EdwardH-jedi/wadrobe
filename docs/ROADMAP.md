# Roadmap — The Archive

The Archive is a **premium interactive fashion archive MVP**: upload real clothing
photos, archive them with a **local demo** classification you confirm, browse a
curated closet, style a tall faceless **2.5D** mannequin / mirror preview, run a
Fit Check, and save looks to an editorial board — all persisted locally, in a
dark editorial UI.

It does **not** perform real 3D virtual try-on, cloth simulation, body fitting,
accounts, auth, or cloud sync — and by default it makes no network calls at all.
Two optional layers exist beside the closet: off-by-default serverless functions
in `api/` (including an env-gated vision analyzer), and a local-only FastAPI
service in `backend/` that generates explicitly-labeled **proxy** 3D GLBs. The
second is Track B and is documented in `docs/AVATAR_TRACK.md`, not here.

Phase numbering below matches the original build plan (`PLAN.md` has since moved
on to a separate purchase-accuracy plan).

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

### Phases 11–12.5 — Asset storage & consistency hardening ✅
Storage-only, no visible product change. Phase 11 moved new uploads' heavy
cropped/cutout images into an IndexedDB **Blob** store
(`lib/storage/assetBlobStore.ts`), leaving refs + the thumbnail in metadata and
resolving the display blob at hydration (precedence preserved, legacy garments
untouched, data-URL fallback when IDB is absent). Phase 12 added a conservative,
**fail-closed orphan-blob sweep** over a single owned-keys source. Phase 12.5
hardened it for multiple tabs with a **blob-age gate** (timestamped keys) and an
explicit `ok`/`unavailable` metadata-read status.

### Phases 3–4 (current `PLAN.md`) — Purchase accuracy & the optional vision seam ✅
The current plan shifted the accuracy source from the photo to the purchase:
product-URL prefill through the `api/product-meta` function, and a **real vision
classifier** behind `api/analyze` that is **env-gated and off by default**
(`VITE_ANALYZER=vision` + `VITE_API_BASE`). When it is on, the scan copy states
plainly that the photo is sent to a server, and the guess is still a non-binding
draft the user confirms. With the env unset, nothing leaves the device.

## Track B — Avatar Lab (separate, additive track)

The optional local FastAPI service in `backend/` and the Proxy 3D Lab view are
**not** part of the roadmap above. They ship an honest **proxy**: a textured
extruded silhouette GLB, a procedural faceless mannequin, and bounding-box
outfit alignment — no reconstruction, no fitting, no simulation. Scope, phase
status, and the wording rules live in `docs/AVATAR_TRACK.md`.

## Future phases — NOT yet built (do not imply these exist)

### Future — Higher-quality cutout
Upgrade cutout quality with an on-device **WASM/ML segmentation** model dropped
into the existing `CutoutDeps` adapter (kept optional/lazy so startup never
depends on it). The current Phase-10 cutout is a classic flood fill — real, but
limited to clean flat-lay backgrounds; ML segmentation is the quality path.
Still open alongside it: **full-resolution image Blobs** (today only the
downscaled thumbnail is kept) and smarter dominant-color / palette extraction.

### Future — Real product *recognition*
The vision seam is wired (see above) and an optional `api/candidate-search`
function can query eBay's Browse API for **reference candidates** when
server-side keys are configured — but neither recognizes a specific product.
Nothing is auto-matched: candidates are suggestions the user confirms, and with
the keys unset the flow stays on local demo candidates. Brand/logo
identification and a verified product match remain unbuilt. See
`docs/AI_IMAGE_PIPELINE.md`.

### Future — Three.js / React Three Fiber room
Replace the CSS studio scene with a real 3D showroom (R3F): lit room, physical
materials (walnut, chrome, concrete), camera moves between zones; a 3D/GLB
mannequin with garment textures on body regions. The domain + state layers are
renderer-agnostic, so this is a presentation swap, not a rewrite. `three` is
already a dependency for Track B's GLB viewer, but it is deliberately confined
to a dynamic import there — the studio scene today is still plain CSS.

### Future — Virtual try-on research / prototype
Research genuine garment-on-body rendering (pose estimation, cloth warping, or
diffusion-based try-on) behind a clearly-labeled experimental flag. Describe it
as "real try-on" **only once it actually is** — until then the closet preview
remains an explicit 2.5D styling composition and Track B's output remains an
explicit proxy.

## Cross-cutting (any phase)

- Optional cloud sync / accounts (currently out of scope).
- Export / share a look as an editorial image.
- Outfit suggestions from the Fit Check heuristics.
- Accessibility and reduced-motion audits.
