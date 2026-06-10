# Manual QA Checklist — The Archive

Run `npm run dev` and walk through these. (Automated coverage:
`npm run typecheck`, `npm run lint`, `npm test`.)

## Upload & archive (the Phase 3 ritual)

- [ ] Open Upload (sidebar, topbar, or rail "Upload" button).
- [ ] Drag-and-drop a clothing image onto the dropzone; also try click-to-browse.
- [ ] A non-image or oversized file shows a clear error, not a crash.
- [ ] A **demo style scan** sweeps the preview ("Reading silhouette, color &
      category locally…"), then a **Draft metadata suggestion** card appears with
      a "Demo · N%" badge. Copy reads as a *local demo* — never "AI detected".
- [ ] Suggested category, color, and tags are pre-filled but editable; brand is
      empty (the mock never fabricates one).
- [ ] Edit name/brand/category/color/tags/notes, then **Confirm Archive Piece**.
- [ ] A brief "Sealing the archive…" beat, then an **"Archive Piece created"**
      card shows the garment (image, name, category, color, tags, date).
- [ ] The piece then transitions into the bottom rail (highlight flourish) and
      appears in the closet and the room's clothing rack.
- [ ] **View in archive** closes the modal immediately (no need to wait for the
      auto-advance).
- [ ] The new piece is selectable for an outfit straight away.
- [ ] **Reload** — the new piece persists (it is saved at confirm, before the
      celebration).
- [ ] Repeat the upload a few times — no stuck "scanning" state; each run ends in
      a fresh idle dropzone.
- [ ] **Discard** during review, or closing the modal mid-scan, returns to the
      dropzone without saving (and no stale suggestion lands afterwards).
- [ ] A **corrupted / undecodable** image (e.g. a `.jpg` whose bytes aren't a
      real image) is rejected with "This image could not be read…" — it never
      reaches the suggestion/confirm step and is never archived as a broken image.
- [ ] In the suggestion step, clearing the **Name** disables "Continue" and shows
      "Name this archive piece before confirming."; typing a name re-enables it.
      (Same required-name gate on the Edit modal's "Save changes".)

## Manual crop / 2D asset (Phase 9)

- [ ] Upload a clothing photo. After the demo scan, a **"Prepare display asset"**
      step appears with a live crop window over the photo and **Zoom / Horizontal
      / Vertical** sliders. Copy reads honest — "a local, manual crop", "You can
      remove the background next" — never "AI cutout" or "automatic background
      removal". (Background removal itself is the **next** step — Phase 10 below.)
- [ ] Drag **Zoom** up → the crop window shrinks; **Horizontal/Vertical** pan it
      (disabled at zoom 1). **Reset crop** returns to the full image.
- [ ] **Use crop** → continue to metadata; the review preview, then the closet /
      filmstrip / rack / mannequin / mirror, all show the **cropped** asset.
- [ ] **Use original** (or leaving zoom at 1, where the button reads "Continue")
      → the uploaded photo is used unchanged.
- [ ] Upload an **invalid / corrupted** image → still rejected before the crop
      step (never archived as a broken image).
- [ ] Crop, archive, then **reload** → the cropped asset persists.
- [ ] With seed/sample data, confirm category placement on the mannequin reads
      cleanly: outerwear/top on the torso, pants on the legs, shoes at the feet
      (fit-to-frame, not over-cropped), an accessory upper-side. A selected top
      stays visible in front of outerwear.
- [ ] (If you also attach a product **reference** image as the display) toggling
      **Archive display image → Uploaded photo** restores your **crop**, not the
      raw photo.

## Local background removal / cutout (Phase 10)

- [ ] After the crop step, a **"Local background removal"** /
      **"Experimental garment cutout"** step appears. Copy reads honest — "a local
      preview only, no upload", "Quality varies" — never "AI", "automatic", or
      "perfect" cutout.
- [ ] **Prepare cutout** on a clean flat-lay → a brief processing beat, then a
      **before / after** preview: the "Cutout preview" shows the garment on a
      checkerboard (transparent background removed). **Use cutout** → it carries
      into review, then the closet / filmstrip / mannequin / mirror all show the
      cut-out garment.
- [ ] **Continue without cutout** (before or after preparing) archives with the
      uploaded/cropped image — cutout is fully skippable.
- [ ] **Busy / non-flat-lay background** → "Background removal was unavailable for
      this image…"; the flow is **not stuck** — Continue without cutout still
      archives. No fake cutout is produced.
- [ ] A cutout, once accepted, **persists across reload** (closet/mannequin still
      show it).
- [ ] (Precedence) If you cut out a garment and *also* pick a product **reference**
      image as the display, the **reference** shows — an accepted cutout never
      silently overrides your latest reference choice. Toggling **Archive display
      image → Uploaded photo** restores the cutout.
- [ ] Existing garments without a cutout still render normally everywhere; saved
      outfits and current-outfit selection are unaffected.

## Asset storage / blob pipeline (Phase 11)

This is **storage hardening only** — no visible product change. With IndexedDB
available (storage badge reads "IndexedDB · persistent"):

- [ ] Upload → crop → accept a cutout → archive. The piece shows normally in
      closet / filmstrip / mannequin / mirror (no visible difference).
- [ ] **Reload the page.** The cutout still renders everywhere (it is resolved
      from the IndexedDB blob store, not from a data URL in metadata).
- [ ] Create a garment that uses a **product-reference** display *and* has a
      cutout; **reload** → the **reference** still shows (a stored cutout never
      shadows it).
- [ ] **Delete** a garment → it disappears and the UI stays stable (its blobs are
      cleaned up). Deleting a **saved outfit** does NOT delete garments/blobs.
- [ ] Existing (pre-Phase-11) garments and saved outfits load and render exactly
      as before.
- [ ] In a private/incognito window or a browser with IndexedDB blocked (storage
      badge reads "localStorage" or "In-memory"), upload still works — blob-backing
      is simply skipped and the image is kept inline (graceful fallback).

## Storage consistency hardening (Phase 12)

Still storage-only — no visible product change. The hardening is mostly invisible;
these confirm it does not break anything:

- [ ] Upload a cutout garment, **reload** — it still renders (the orphan sweep ran
      at startup but never touched the referenced blob).
- [ ] **Delete** a garment → UI stable, its blob is cleaned. **Reset/clear** the
      archive (if exposed) → UI stable, all blobs cleared.
- [ ] Add several garments over a long session, reloading between — images keep
      rendering and stored blob count tracks the garment count (no unbounded growth,
      no broken images).
- [ ] (Developer check) In DevTools → Application → IndexedDB, manually add a stray
      record to `fit-archive-assets` → reload → the stray is reclaimed by the
      sweep, and existing garments are unaffected.
- [ ] If a save ever fails (e.g. quota), the previously archived pieces remain on
      reload; a not-yet-persisted piece may be dropped (its orphan blob is reclaimed
      next load) — never a broken/empty image.

## Cross-tab orphan-sweep safety (Phase 12.5)

- [ ] (Developer check) Add a stray record to `fit-archive-assets` with a key like
      `asset_<recent-ms>_x` (timestamp = a few seconds ago) → reload → it is **kept**
      (a recent blob may belong to another tab whose metadata isn't visible yet).
- [ ] Add a stray record with `asset_<old-ms>_x` (timestamp ≥ ~1 hour ago) → reload
      → it **is** reclaimed. New uploads use timestamped keys automatically.
- [ ] A legacy key without a timestamp segment (`asset_<uuid>`) is never swept
      (treated as unsafe), so pre-12.5 garments keep their blobs.
- [ ] Corrupt the `fitarchive:garments` value to invalid JSON → reload → the app
      loads an empty archive AND the sweep is **skipped entirely** (no blob is
      deleted), because a failed read isn't trusted as "no garments".
- [ ] Open the app in two tabs: upload in Tab A, then reload Tab B before Tab B
      could have seen the new garment → Tab A's just-uploaded image is preserved
      (its blob is too recent to sweep).

## Product reference & garment asset (Phase 8)

- [ ] After metadata, **Continue** opens an optional **reference** step ("Attach
      product context"). Copy reads as a *local demo* — never "exact / official /
      AI-matched / automatically recognized product".
- [ ] **Confirm with no reference edits** → the piece archives with your uploaded
      photo (the default). Reference matching is fully skippable.
- [ ] Pick a **demo reference candidate** → its label fills in; nothing is matched
      automatically; the manual-entry option is always first.
- [ ] Enter a **reference image URL**, toggle **Archive display image → Reference
      image** → the archived card / closet / mannequin show that image; switch
      back to **Uploaded photo** to restore it. An empty/invalid reference falls
      back to the uploaded photo.
- [ ] **Back** returns to metadata; the name is still required to Continue/Confirm.
- [ ] Existing (pre-Phase-8) garments still render their image everywhere
      (closet / filmstrip / rack / mannequin / mirror / saved cards).

## Edit & delete

- [ ] In the Closet, click a card's edit (pencil) icon → the editor opens with
      current values and the image preview.
- [ ] Change fields and **Save changes** → the card updates.
- [ ] If you change a selected piece's category, it leaves its old outfit slot
      (no stale selection).
- [ ] Click delete (trash) → confirm → the piece disappears everywhere and is
      removed from any outfit slot it filled.

## Persistence (reload)

- [ ] Add a few pieces and save a look, then **reload the page**. Garments and
      saved looks are still there.
- [ ] The current outfit is restored on reload.
- [ ] Storage badge (sidebar foot) shows IndexedDB or localStorage —
      "In-memory" only on a storage-blocked browser.

## Outfit selection & replacement

- [ ] Click a piece (card, rail, or builder) → it fills its category slot on the
      mannequin and inspector.
- [ ] Select a **different top** → it **replaces** the previous top (one piece
      per category).
- [ ] Selections in other categories are unaffected.
- [ ] Clear a single slot (inspector ✕ or builder "Clear"); Clear all empties
      the outfit.

## Fit Check

- [ ] Fit Check rating/meter update as you add pieces
      (Empty → Coming together → Strong → Editorial).
- [ ] Palette swatches, tone, and dominant tags reflect the selected pieces.
- [ ] Notes give sensible guidance (e.g. "Add shoes to ground the look").

## Mannequin & Mirror preview (Phase 4)

- [ ] Open the **Mirror** view. Select a **top** → it appears layered on the
      mannequin's torso zone; the mirror caption chips + layer count update.
- [ ] Select **pants** → legs zone updates; **shoes** → feet zone; an
      **accessory** → upper-body/side zone. Each uses the real uploaded photo.
- [ ] Clear a slot (inspector ✕ or builder "Clear") → that zone returns to an
      elegant empty placeholder; the mirror caption updates.
- [ ] The mirror caption reads "Mirror composition · 2.5D layered styling
      preview", shows selected category chips + a silhouette hint (e.g. "Complete
      the silhouette with shoes."), and "Select archive pieces to build a fit."
      when empty.
- [ ] **Save** the current outfit, then **Restore** it → the mannequin AND the
      mirror caption update to the restored selection; the inspector matches.
- [ ] **Reload** after restoring → the current outfit (mannequin + mirror) is
      still there.
- [ ] No copy claims real 3D try-on, garment physics, cloth simulation, or
      accurate body fitting — only "2.5D layered styling preview".

## Save & restore looks (Phase 5 board)

- [ ] Name and save the current outfit (inspector) → it appears on the Outfits
      board as an editorial card and as a pin in the studio wall board.
- [ ] The saved card shows the garment thumbnails, a **vibe label** (e.g.
      "Minimal silhouette"), the **category labels** (e.g. "Top · Pants"), the
      created date, and Restore/Delete — and reads editorial, not cluttered.
- [ ] **Restore fit** → the look loads onto the mannequin; the mirror caption and
      Current Fit inspector update; the Mirror view opens.
- [ ] **Delete** a saved look (confirm) → it disappears, but the **garments are
      NOT deleted** (still in the closet and on the rail).
- [ ] **Reload** → saved/restored looks persist; a deleted look stays gone.
- [ ] Empty board shows "Your look board is waiting" with an "Open the Mirror"
      action.
- [ ] No copy claims AI-generated styling or real 3D try-on — the vibe label is a
      local, deterministic descriptor.

## Studio scene

- [ ] Each zone is clickable: rack → Closet, mirror/mannequin → Mirror, board →
      Outfits, shelf → Closet.
- [ ] Mirror shimmer and spotlight feel premium (not flickery); reduced-motion
      users get a calm version.

## Empty states

- [ ] With no garments: Closet shows "Your archive is empty" with Upload + Load
      sample; the room shows empty rack/shelf and the bare mannequin silhouette.
- [ ] "Load sample" populates a curated set; the room and closet fill.
- [ ] Outfits board shows an empty-board state with a CTA to the Mirror.
- [ ] Filtering to a category/tag with no matches shows a "Clear filters" state.

## Responsive layout

- [ ] ~1280px+: full three-column room, two-column mirror view.
- [ ] ~860px: sidebar collapses to icons; room reflows; rail spans correctly.
- [ ] ~560px: room and forms stack to a single column; nothing overflows.

## Visual direction (sanity)

- [ ] Reads as a dark editorial showroom — **not** cute/childish/beige/cozy.
- [ ] The mannequin is tall and **faceless** (no character/avatar).
- [ ] Uploaded clothing photos are the visual focus.
- [ ] No copy anywhere claims real 3D virtual try-on.
