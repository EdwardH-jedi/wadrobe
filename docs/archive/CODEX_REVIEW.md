> **Historical document — not current implementation status.**
> Kept for the reasoning it records. It was accurate when written and has not
> been maintained since. For what the repository actually contains today, see
> [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md).

---

# Codex Review — The Archive (Fit Archive)

Handoff for external (Codex) review. **Phase 7 will refine this**; today it is a
useful working baseline.

## Project summary

The Archive is a **premium interactive fashion archive MVP** (Vite + React 18 +
TypeScript strict, plain CSS, Vitest). A user uploads real clothing photos; the
app archives each as an "Archive Piece" with a **local demo** classification the
user confirms, then browses a closet, styles a tall faceless **2.5D** mannequin /
mirror preview, runs a deterministic Fit Check, and saves looks to an editorial
board. Everything persists **locally** (IndexedDB → localStorage → memory). There
is **no backend, no real AI, no real 3D**.

Source of truth for scope/phases: `PLAN.md`. Architecture: `docs/ARCHITECTURE.md`.

## Implemented phases (all green)

- **Phase 1** — core data flow: domain types, hydration-gated persistence,
  outfit selection by category with replacement, save/restore/delete looks.
- **Phase 2** — clothes visually central: filmstrip, closet cards, studio scene,
  inspector, larger thumbnails.
- **Phase 3** — upload-to-archive ritual (demo scan → draft suggestion → confirm
  → "Archive Piece created" → transition). **3.5:** corrupt-image rejection +
  required-name validation.
- **Phase 4** — mannequin/mirror: garments mapped to body zones; a Mirror
  composition caption with an honest "2.5D layered styling preview" label.
- **Phase 5** — saved outfit board: editorial cards (thumbnails, a deterministic
  vibe label, category labels, restore/delete).
- **Phase 6** — architecture/docs hardening.
- **Phase 8** — product-match + `GarmentAsset` pipeline (display/original/
  reference images behind `getGarmentDisplayImage`; optional local-demo reference
  step). **Phase 9** — manual crop ("Prepare display asset") + category mannequin
  layer presets. **Phase 10** — real, local, opt-in **background removal**
  (`garmentCutout.ts`, an edge-seeded flood fill; NOT ML/cloud/recognition/3D) →
  transparent WebP `cutoutImageUrl`, non-blocking. **Phase 11** — **asset storage
  hardening**: new uploads' heavy cropped/cutout images are stored as Blobs in an
  IndexedDB asset store (`assetBlobStore.ts`); metadata keeps a thumbnail + refs
  and resolves the display blob at hydration. Backwards compatible (legacy/no-ref
  garments untouched), precedence preserved after reload, graceful fallback to
  data URLs when IDB is unavailable. No new product behavior. **Phase 12** —
  storage-consistency hardening: a conservative, fail-closed orphan-blob sweep at
  hydration (reclaims blobs from failed saves; never deletes a referenced blob),
  a single owned-keys source (`garmentBlobKeys`) shared by delete + sweep, and a
  confirmed store-owned object-URL lifecycle. **Phase 12.5** — cross-tab safety:
  a blob-age gate (timestamped keys; recent blobs are kept so a sibling tab's
  in-flight write isn't swept) and an explicit `ok`/`unavailable` metadata-read
  status (a failed read skips the sweep). Still storage-only.

## Expected MVP behavior

Upload a clothing photo → demo scan → confirm/edit a draft suggestion (name
required) → it archives, animates into the rail, and appears in the closet/rack →
select pieces (one per category; a new selection replaces the old) → the 2.5D
mannequin and mirror update → run the Fit Check → save the look → it appears on
the board → restore it (mannequin/mirror/inspector update) → delete it (garments
are kept) → reload: all garments, the current outfit, and saved looks persist.

## Non-goals (by design — not bugs)

No backend / auth / accounts / cloud sync. No real AI product recognition (the
analyzer is a deterministic keyword mock). No real 3D virtual try-on / cloth
simulation / body fitting (the preview is explicitly 2.5D). No heavy
dependencies (runtime deps: `react` + `react-dom` only). **Background removal
(Phase 10) is real but deliberately a local, classic edge flood fill — NOT ML
segmentation, cloud AI, or product recognition** — opt-in, non-blocking, with
honest "experimental / quality varies / local preview" copy.

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest run (100+ tests)
npm run lint        # eslint (flat config)
npm run build       # tsc --noEmit && vite build
```

## High-risk areas to scrutinize

- **Persistence / hydration** (`ArchiveProvider`, `archiveStorage`,
  `assetBlobStore`, `garmentAssetStorage`): writes gated on `hydrated`; the reload
  round-trip; sanitize-on-reload of dangling selection references; **the Phase 11
  blob round-trip** (dehydrate on persist / hydrate-resolve on load) — verify a
  blob-backed cutout survives reload, a product-reference still wins over a stored
  cutout after reload, legacy garments pass through untouched, and IDB-absent
  falls back to data URLs. **Phase 12/12.5 orphan sweep** — verify it is
  fail-closed, uses the frozen pre-hydration candidate snapshot, runs deletion
  fire-and-forget, and reclaims only blobs that are unreferenced **and** old
  (timestamped-key age gate keeps recent/cross-tab blobs) **and** loaded under an
  `ok` metadata-read status (an `unavailable`/corrupt read skips the sweep). A
  legacy timestamp-less key is never swept.
- **Upload flow** (`uploadFlow` reducer + `UploadGarmentModal`): the canvas path
  can't run in jsdom, so the scan→archived UI flow is **not** integration-tested —
  only the reducer, the REJECT path, and decode validation (via a stubbed
  `Image`). The felt ritual is eyeball-only.
- **Honesty of user-facing copy**: it must never imply real AI / 3D. Guarded by
  the `UPLOAD_COPY` honesty test, but worth a human scan of all rendered strings.
- **Data-loss edges**: deleting a saved look must keep garments (tested at the
  provider + reducer); deleting a garment leaves a gap in saved looks that
  reference it (known; rendered gracefully).

## Known limitations

- **Visual-unverified**: no headless-browser test, so "reads premium / not
  cluttered / nothing clips" is eyeball-only (`npm run dev`; check ~1280px). No
  known clip failure modes post-Phase-2.5.
- Canvas / IndexedDB are absent in jsdom → those paths are unit-tested at their
  seams, not end-to-end.
- Saved looks aren't re-sanitized when a referenced garment is deleted (the card
  renders the hollow state gracefully rather than auto-pruning).

## Verdict criteria

- **PASS** — typecheck/test/lint/build green; the MVP flow above works; no copy
  claims real AI/3D; no data-loss path.
- **PASS WITH WARNINGS** — green and the flow works, but minor honesty/UX/polish
  nits or untested edges remain (document them).
- **BLOCK** — a broken core flow (upload / persist / select / save / restore /
  delete), a failing command, a data-loss bug, or copy that claims real AI or 3D
  try-on.

## Copy-paste review prompt

> Review the "The Archive" (Fit Archive) repo as an external reviewer. It is a
> local-only fashion-archive MVP (React 18 + TS strict + Vite; no backend, no real
> AI, no real 3D — the analyzer is a deterministic mock, the preview is 2.5D).
> Read `PLAN.md` and `docs/ARCHITECTURE.md` first. Run `npm run typecheck`,
> `npm test`, `npm run lint`, and `npm run build` and confirm they are green. Then
> check: (1) the MVP flow (upload → demo scan → confirm → archive → select →
> mannequin/mirror update → save → board → restore → delete-keeps-garments →
> reload persistence); (2) no user-facing copy implies real AI recognition or real
> 3D try-on; (3) data-loss edges (delete a look vs delete a garment); (4) the
> hydration-gated persistence and sanitize-on-reload. Note the canvas/image upload
> path can't run in jsdom (it is tested at its seams). Return a verdict of PASS /
> PASS WITH WARNINGS / BLOCK with specific, file-cited findings, and flag any
> over-engineering or scope creep.
