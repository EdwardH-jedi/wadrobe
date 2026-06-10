# PLAN.md

## Product Vision

Fit Archive / The Archive is an interactive fashion archive where users upload real clothing photos, classify them into a personal digital wardrobe, and style outfits on a premium mannequin/mirror preview inside a dark editorial archive room.

This is not a real 3D virtual try-on product yet. The current goal is a convincing MVP illusion: real clothing photos become archive pieces and can be styled through layered 2.5D mannequin previews.

## Project Tracks (added 2026-06-10)

AvatarWardrobe now has two explicitly separated tracks:

1. **Track A — Fit Archive closet layer (this plan).** The existing local-first
   2.5D fashion archive described by this file. All phase numbering, non-goals,
   and rules in this file apply to this track. Phases 1–12.5 are complete; the
   next incomplete phase is Phase 13.
2. **Track B — Avatar Lab (additive; spike B2 done).** An optional, additive
   backend + 3D/GLB avatar try-on pipeline, documented in
   `docs/AVATAR_TRACK.md`. As of 2026-06-10, phase B2 is implemented in
   `backend/`: a local FastAPI feasibility spike that converts a PNG into an
   honest proxy-3D GLB (`POST /api/proxy-3d`). No three.js and no Track B
   frontend code exist yet. Track B work must never rewrite, rename, or
   degrade Track A code; its phases are tracked in `docs/AVATAR_TRACK.md`,
   not here.

The "Non-Goals For Now" list below remains binding for Track A. Backend/3D
items become in-scope only inside explicitly started Track B phases.

## Core UX Promise

The user should feel:
“I uploaded my real clothes, the app understood them, archived them into my fashion room, and let me style outfits visually.”

## Non-Goals For Now

* No backend/auth
* No cloud storage
* No real AI product recognition yet
* No real 3D cloth simulation
* No garment mesh generation
* No claim that the app performs real virtual try-on
* No cute/chibi/kids-room visual direction
* No large dependency bloat

## Visual Direction Rules

Must be:

* dark charcoal / off-black / warm grey
* premium, editorial, fashion-forward
* archive/showroom/studio-like
* uploaded clothing photos must be visually central
* mannequin should be tall, faceless, and fashion-oriented
* UI should feel like a curated archive system

Avoid:

* beige cozy room
* toy-like objects
* childish icons
* oversized empty room
* cute avatar
* generic ecommerce grid
* generic SaaS dashboard

## Current State Notes

> _This is the only section added to the original plan template. Everything above and below is reproduced as written. This section is the Phase 0 deliverable._
>
> _Audit date: 2026-06-08._

### Verification results (this audit)

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | ✅ Pass — 0 errors |
| `npm test` (`vitest run`) | ✅ Pass — 28 tests across 5 files |
| `npm run lint` (`eslint .`) | ✅ Pass — 0 problems |
| `npm run build` (`tsc --noEmit && vite build`) | ✅ Pass — 73 modules, ~197 kB JS (62.7 kB gzip), ~31 kB CSS |

`node_modules` was already installed; no `npm install` was required.

**Important caveat — "code present" ≠ "flow verified."** The four commands above
are static analysis + unit tests only. Per CLAUDE.md, the canvas/image path is
deliberately kept out of unit tests (jsdom has no canvas), so the real
upload → archive → persist → reload → restore flow is **not** exercised by the 28
tests. Read the per-phase notes below as "implementation exists and compiles,"
**not** "manually verified end-to-end in a browser."

### Reality vs. the phase template

This is a **mature, feature-complete MVP base**, not a broken or partial
scaffold. The file layout and architecture match CLAUDE.md exactly
(`domain/` → `lib/` → `app/providers/` → `components/`; one pure reducer; a
hydration-gated persistence facade). Most of what Phases 1–5 describe already
exists in code:

* **Phase 1 — Core data flow: present.** `archiveReducer.ts` is pure (ids,
  timestamps, and events are passed in via action payloads); `ArchiveProvider.tsx`
  wraps it and wires persistence. Covered: add/update/remove garment, select by
  category with replacement, clear slot, clear outfit, save/restore/remove saved
  outfit. The `sanitizeOutfit` invariant keeps the selection consistent when
  garments change. Persistence facade selects IndexedDB → localStorage → memory
  and gates writes on a `hydrated` flag. Unit tests cover the reducer, storage
  fallback, fit check, mock AI shape, and an `<App/>` mount.
* **Phase 2 — Clothes central: present.** Layout is `SidebarNav` (left) + main
  view + bottom `GarmentFilmstrip`, with `ClosetPanel`, `OutfitInspector`, and
  `MirrorPreview`. Whether clothes read as the visual *hero* is a design-judgment
  item to confirm in-browser, not a missing-code gap.
* **Phase 3 — Upload transition: present.** `UploadGarmentModal` already does
  idle → scanning overlay (min 1.3 s) → mock AI guess with a confidence % →
  confirm/edit → archive, plus an "entered the archive" highlight on the
  filmstrip (`enteredId`, ~1.2 s). The AI guess is non-binding; the user always
  confirms.
* **Phase 4 — Mannequin: present.** `MannequinPreview` is a tall, faceless SVG
  silhouette with torso / leg / foot / accessory zones; selected garment photos
  are mapped onto the zones as matted panels (`mix-blend-mode: multiply`).
  Correctly stylized 2.5D — not claimed as real try-on.
* **Phase 5 — Saved board: present.** `OutfitWallBoard` + `SavedOutfitCard`
  render saved looks with restore/delete.
* **Phase 6 — Docs: partially present.** `docs/ARCHITECTURE.md`,
  `docs/ROADMAP.md`, `docs/AI_IMAGE_PIPELINE.md`, and `docs/QA_CHECKLIST.md`
  exist (their accuracy was not re-audited this pass).

### Known gaps / blockers

* **Blockers: none.** The app type-checks, tests, lints, and builds clean, and
  `<App/>` mounts in tests. The "fix a tiny blocker to start Phase 1" exception
  does **not** apply, so Phase 1 was intentionally **not** started.
* `docs/CODEX_REVIEW.md` does **not** exist yet. It is a **Phase 7** deliverable
  and was intentionally **not** created in this pass to avoid jumping ahead.
* `PLAN.md` did not exist before this pass — it is created here as the source of
  truth.
* Because Phases 1–5 are already largely implemented, the practical work for each
  is **audit + in-browser verification + targeted polish**, not greenfield
  building. When picking up a phase, re-scope it to "verify against the listed
  acceptance criteria, then fix only the gaps found."

### Phase 1 results (2026-06-08)

Phase 1 was executed as a **verification pass**, not a rewrite. A multi-agent
adversarial audit (9 reviewers over 8 data-flow dimensions, every claimed bug
independently re-verified) found **0 real bugs** in the core data flow — the
reducer, provider, persistence facade, selection, and save/restore logic are all
correct. So Phase 1 changed **only test files**; no production source was
touched (the production bundle hashes are unchanged).

The work closed the test-coverage gaps the Phase 0 caveat flagged. In
particular, **the headline reload guarantee is now covered by automated tests**
(previously only reasoned about): a two-lifecycle `ArchiveProvider` test mounts
the real provider over the real storage facade, builds an outfit, unmounts, and
re-mounts to prove garments + saved look + current outfit all survive a reload —
plus a sanitize-on-reload case (a dangling reference is dropped) and a
hydration-gating case (the empty initial state never clobbers a pre-seeded
store).

**Scope of "upload" coverage:** what is now regression-locked is the upload
*data flow* — `addGarment(normalizeDraft(draft))` plus persistence — not the
upload *UI*. The `UploadGarmentModal` interaction and the image downscaling in
`imageFileUtils` remain outside the automated suite by design (jsdom has no
canvas; same reason as the Phase 0 caveat). The optional `npm run dev` smoke
below is the right complement for the UI/image path.

Tests grew from **28 → 66** (5 → 10 files). New/changed:

* `src/app/providers/ArchiveProvider.test.tsx` *(new, 8 tests)* — action
  creators (id/timestamp/event minting, category→slot routing, empty-outfit
  guard returning null, cover-hue fallback), restore/remove, **reload
  round-trip**, sanitize-on-reload, and hydration-gating no-clobber.
* `src/app/providers/archiveReducer.test.ts` *(+6 tests)* — `UPDATE_GARMENT`
  category-change clears the dangling slot (no auto re-slot), `RESTORE_OUTFIT`
  sanitize, `SAVE_OUTFIT`/`REMOVE_OUTFIT`, `CLEAR_OUTFIT`, reducer purity
  (frozen input not mutated).
* `src/lib/storage/archiveStorage.test.ts` *(new, 5 tests)* — memory adapter
  round-trip + `clearAll`, facade backend selection, `getArchiveStorage`
  memoization.
* `src/lib/storage/localStorageFallback.test.ts` *(+5 tests)* — current-outfit
  null-when-absent vs stored-empty, `clearAll` clears all keys, corrupt-JSON
  resilience for the saved-outfit/current-outfit keys, and a new-adapter-instance
  reload round-trip.
* `src/lib/storage/indexedDbStorage.test.ts` *(new, 2 tests)* — IndexedDB
  graceful-degrade path in jsdom.
* `src/domain/garmentDraft.test.ts` *(new, 7 tests)* — `normalizeDraft`
  (name default, trim, tag dedupe/lowercase/blank-drop), `emptyGarmentDraft`
  defaults, `garmentToDraft` array-copy isolation.
* `src/domain/outfitTypes.test.ts` *(new, 5 tests)* — slot/category structural
  invariant, `isOutfitEmpty`/`countFilledSlots`.

Verification (all green): `npm run typecheck` ✅ · `npm test` ✅ 66/66 ·
`npm run lint` ✅ · `npm run build` ✅ (bundle unchanged).

Deferred (out of Phase 1 scope, noted so they are not lost): deeper `fitCheck`
branch coverage (tone branches, dominant-tag tiebreak) belongs nearer Phase 4
(the mirror/fit-check upgrade); the IndexedDB stalled-`open()` timeout fallback
is covered by reasoning and left for a dedicated fake-timer pass; taxonomy-lookup
and extended mock-AI shape tests are low-value polish.

### Suggested next step

Core data flow is now stable and reload-verified. Next session can either:

* **Continue to Phase 2 (Make Clothes Visually Central)** — a design/UX pass; or
* Optionally do a quick **manual in-browser smoke** (`npm run dev`) of
  upload → confirm → filmstrip → select → save → reload → restore to confirm the
  automated coverage matches lived behavior, before visual work.

Do not begin Phase 2 visual changes until you have re-read PLAN.md and confirmed
Phase 1 status is Complete (it is).

### Phase 2 results (2026-06-08)

Phase 2 (Make Clothes Visually Central) was executed as an **audit + targeted
CSS/markup polish pass**, not a rebuild. A 6-agent UI audit (28 recommendations,
12 high-priority, 9 red flags, 0 "weak" areas) confirmed the closet cards, outfit
inspector, filmstrip, saved-look cards, mannequin, sidebar, and design tokens
were already on-brand and clothes-led — those were **preserved**. The weak spot
was the studio landing scene (mannequin rendered small and out-massed by a
redundant full-height decorative mirror), plus generally undersized garment
thumbnails and an over-heavy topbar.

**What changed (all targeted, low-risk):**

* **Studio scene** — re-balanced the room grid so the styled mannequin spans two
  rows (the hero) and the decorative mirror no longer runs full height; enlarged
  the central mannequin (190→210px, scoped so the small mirror reflection is
  unchanged) and the clothing-rack thumbnails (30×40 → 42×56); softened the
  stage's empty-set vignette. Added an **in-scene empty prompt** ("Your studio is
  empty" + Upload / Load sample) so the room never reads as a bare dark set — the
  room stays mounted underneath it.
* **Closet cards** — larger grid tracks (min 190→230px), softened the image
  vignette so garments read brighter, promoted brand to its own editorial line,
  slightly larger color swatch.
* **Filmstrip** — larger thumbnails (52×64 → 64×80, with the studio bottom
  reserve bumped 92→108px in lockstep) and a clearly distinct selected state
  (2px accent ring + glow + lift) so styled pieces are obvious.
* **Inspector** — larger current-fit slot thumbnails (46×56 → 56×70) so the
  picked garments are the hero of each row.
* **Saved board** — taller look-card thumbnail strip (16/7 → 4/3).
* **Hierarchy** — right-sized the persistent topbar title (30→25px) and trimmed
  topbar/view padding so clothes sit higher on every view.

**Files changed:**

* `src/styles/archive-theme.css` — ~16 targeted token/sizing tweaks + new
  `.studio__empty` and `.garment-card__brand` rules.
* `src/components/studio/StudioScene.tsx` — in-scene empty prompt (+ `onUpload`
  prop, `loadSampleArchive`).
* `src/components/studio/ArchiveStudio.tsx` — pass `onUpload` to the scene, and
  suppress the topbar's `Load sample` button on the studio view so the in-scene
  prompt owns that single CTA (no duplicate buttons on the empty studio).
* `src/components/closet/GarmentCard.tsx` — brand on its own line.
* `src/app/App.test.tsx` — +2 tests: the empty-studio prompt renders with the
  room still mounted underneath, and clicking the prompt's "Load sample" loads
  the sample archive and dismisses the overlay (also pins that the studio view
  has exactly one "Load sample" CTA).

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 68/68 (was
66; +2) · `npm run lint` ✅ · `npm run build` ✅ (CSS 30.97→31.52 kB,
JS 197.2→197.9 kB — the new rules + overlay markup).

**Known limitation — visual changes are NOT eye-verified.** As with the
Phase 0/1 caveats: typecheck/test/lint/build are static + unit only; none of them
render the page, and every Phase 2 acceptance criterion is visual ("clothes
immediately visible," "premium," "mannequin central"). The new room grid was
hand-verified as valid (each named area is rectangular) and `.stage` clips
overflow, but the result was **not screenshotted** — no headless browser is
installed and adding one would violate the no-heavy-deps rule. **Recommended:**
run `npm run dev`, click "Load sample", and eyeball studio / closet / mirror /
board — in particular confirm the enlarged two-row mannequin does not overflow on
a short window. All changes are CSS/markup-only and trivially reversible.

### Suggested next prompt (Phase 3)

> "Read PLAN.md first. Phase 2 is complete (audit + targeted visual polish);
> optionally eyeball the studio with `npm run dev` first. Now do Phase 3 only —
> Upload To Archive Transition: make the upload moment the signature interaction
> (scanning → mock AI guess → confirm → animate the new piece into the
> room/filmstrip). Note much of this already exists in `UploadGarmentModal` and
> the `enteredId` highlight, so audit first, then targeted polish. Do not start
> Phase 4/5; no real AI/3D. Keep changes small, update PLAN.md, run
> typecheck/test/lint/build, and document blockers + any visual-unverified caveat
> honestly."

### Phase 2.5 — Codex warning cleanup (2026-06-08)

Codex reviewed Phase 2 as **PASS WITH WARNINGS**. This pass addresses the two
actionable warnings only. The Windows-sandbox visual-verification and
git-worktree-provenance warnings were explicitly out of scope and untouched. No
Phase 3 work was done.

**Warning 1 — the Studio view had no persistent Current Fit inspector.** Added a
compact, always-visible **Current Fit rail** to the right of the Studio scene so
the selected outfit is readable without opening the Mirror. It lists all five
slots (outerwear / top / pants / shoes / accessory) with clear empty states, a
filled/total count, and an "Open the Mirror" link. To avoid duplicating logic,
the inspector's slot-list was **extracted into a shared `CurrentFitSlots`
component** (reads the outfit from the store — one source of truth) and is now
reused by BOTH the full Mirror inspector and the new compact rail. The rail folds
away below **1240px** — chosen so it only appears when the viewport is wide
enough to hold both it and the studio room without clipping the room's min-width
tracks (sidebar 240 + rail 264 + stage margins + the room's ~620px track floor
≈ 1240px). Below that, the Mirror view carries the full inspector.

**Warning 2 — mock-AI copy could imply real AI.** Reworded the upload modal so
nothing implies real product recognition:

* "AI Guess" → "Draft suggestion"
* "{n}% conf." → "Demo · {n}%"
* "Scanning…" → "Demo scan…"; "Reading the piece" → "Demo style scan"
* "Analyzing color, category & style…" → "Drafting color, category & style…"
* "The archive is proposing a classification. You will confirm it next." → "A
  local demo suggests a starting point — you'll confirm or edit it next."

No real AI / vision API was added — the analyzer is still the local mock. A
follow-up grep over `src` for `smart / automatic / identif / vision / detect /
recogni / neural / ML` found no user-facing claims (the only hit is the honest
"no real AI / vision recognition runs" disclaimer comment), confirming the whole
*class* of AI-implying copy is gone — not just the two strings Codex named. (The
✨ sparkles glyph was consciously kept: it's decorative and the copy is now
explicit; the warning targeted labels/copy, not iconography.)

**Files changed:**

* `src/components/outfit/CurrentFitSlots.tsx` *(new)* — shared slot-list; a
  `compact` flag toggles the per-slot clear control.
* `src/components/studio/StudioFitRail.tsx` *(new)* — the compact Studio rail.
* `src/components/outfit/OutfitInspector.tsx` — now uses `CurrentFitSlots`
  (inlined markup + now-orphaned imports removed).
* `src/components/studio/ArchiveStudio.tsx` — render the rail beside the scene on
  the Studio view.
* `src/components/closet/UploadGarmentModal.tsx` — honest mock-scan copy.
* `src/styles/archive-theme.css` — `.studio-fit` rail + compact slot variant +
  responsive fold.
* `src/components/outfit/CurrentFitSlots.test.tsx` *(new, 2 tests)* — compact
  omits the clear control; non-compact shows it.
* `src/app/App.test.tsx` — assert the Studio view shows the "Current Fit" rail.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 70/70 (was
68; +2) · `npm run lint` ✅ · `npm run build` ✅ (75 modules; CSS 31.5→32.0 kB,
JS 197.9→198.7 kB).

**Known limitation — visual still NOT eye-verified (same standing caveat).** The
checks are static + unit only. The new right rail is the higher-risk change: it
narrows the studio stage by ~264px and, left unmanaged, would clip the room's
~620px min-width tracks up to ~1240px viewport. That is exactly why the rail is
**folded (`display:none`) below 1240px** — so whenever the rail is shown the room
has room for both and does not clip. By the same arithmetic, below 1240px the
rail is hidden and the room renders full-width (its own pre-existing ~860–958px
clip band, unchanged from Phase 2 and contained by `.stage { overflow: hidden }`,
restacks to a single column at ≤860px). The rail's bottom clears the fixed
filmstrip via `padding-bottom: calc(108px + 18px)` + `overflow-y: auto`. This
reasoning is geometric, not eyeballed. **Recommended before relying on it:** run
`npm run dev`, click "Load sample", and check the Studio at ~1280px (rail shown —
confirm it's a tidy compact summary that doesn't crowd the room or clip the
mirror column) and at ~1024px (rail folded — confirm the room renders cleanly
full-width).

**Note for re-review (deliberate trade-off):** the Studio "Current Fit" rail is a
*responsive* persistent inspector — shown at ≥1240px and folded below that, where
the Mirror view carries the full inspector. This is intentional, not an oversight:
rendering the 264px rail on narrower viewports would clip the studio room (whose
min-width tracks floor at ~620px), and the alternatives — shrinking the
deliberately-enlarged Phase 2 mannequin, or a full studio layout rethink — are
out of scope for a warning-cleanup pass. If a persistent-at-all-widths inspector
is required, that is a small follow-up (e.g. a collapsible rail or a room-track
rework) for a future phase.

**Is Phase 3 safe to begin?** Yes — both actionable warnings are fixed and the
full suite is green. The only thing carried forward is the standing
visual-unverified caveat (a one-time `npm run dev` eyeball of the Studio rail is
recommended but not blocking). Phase 3 (Upload-to-Archive transition) can proceed
in the next session.

### Phase 3 audit (2026-06-08)

Before coding, audited the existing upload flow:

* `UploadGarmentModal.tsx` drives the flow with ad-hoc `useState` (a `phase` of
  `idle | scanning | review`, plus `draft` / `guess` / `drag` / `error` and a
  `requestIdRef` race guard). Validation (type/size) shows an inline error; the
  scan shows a sweep overlay with already-honest Phase-2.5 copy; review shows a
  "Draft suggestion" banner + the full editable `GarmentFields` (name, brand,
  category, color, tags, notes). **`handleArchive` calls `addGarment` and
  immediately closes** — there is no "Archive Piece created" moment.
* The "entering the rail" animation already exists: `onArchived` sets `enteredId`
  in `ArchiveStudio`, which drives `filmstrip__item--enter` — but only *after*
  the modal closes.
* `runGarmentAnalysis` (local mock) is the analyzer; `processImageFile`
  (`imageFileUtils`) does the canvas read/downscale/dominant-color. **Canvas is
  unavailable in jsdom**, so the scan→review→archived UI flow cannot be driven in
  a unit test — the flow *logic* must live in a pure, separately-tested reducer.
* Garments persist via `addGarment` → the storage facade (unchanged).

**Plan:** extract a pure `uploadFlow` reducer (statuses idle / scanning / review
/ archiving / archived / error), persist at confirm (so the celebration is purely
visual and a mid-animation close still saves), add a brief "Sealing…" beat and an
"Archive Piece created" card before handing off to the existing filmstrip
highlight, and centralize all scan/suggestion/archived copy in an `UPLOAD_COPY`
constant so an honesty test can guard the rendered strings.

### Phase 3 results (2026-06-08)

Phase 3 turns the upload into a ritual: **demo scan → draft suggestion →
confirm/edit → "Archive Piece created" → transition into the rail/closet** — all
over the existing local mock (no real AI). **Verdict: PASS WITH WARNINGS** (the
sole warning is the standing visual-unverified caveat below).

**What changed:**

* **New pure state machine** — `uploadFlow.ts`: `uploadReducer` over
  `idle → scanning → review → archiving → archived` (+ `error`). No I/O or timers;
  the created garment is minted by `addGarment` and passed in via `ARCHIVE_START`,
  keeping the reducer deterministic/testable (the real flow can't run in jsdom —
  image processing needs canvas).
* **`UploadGarmentModal` rewritten** onto the reducer. New beats: a premium
  **demo scan** ("Reading silhouette, color & category locally…"), a clearer
  **Draft metadata suggestion** banner (label + hint + "Demo · N%"), a brief
  **"Sealing the archive…"** beat, and an **"Archive Piece created"** card (image,
  name, category, color, tags, date) before the existing filmstrip highlight. A
  **"View in archive"** button finishes immediately; the ~1.6 s auto-advance is a
  fallback only.
* **Persistence happens at confirm** (before any animation), so a mid-celebration
  close still saves. The auto-advance timer uses callback refs so a parent
  re-render can't reset it; the manual button is self-sufficient.
* **Honest copy centralized** in `UPLOAD_COPY` and guarded by a unit test that
  fails if any scan/suggestion/archived string implies real AI / vision
  recognition / 3D try-on.
* **Error & cancel**: invalid type/size → inline reject (stays on the dropzone);
  unreadable image → `error` state with "Try another photo"; a `requestIdRef`
  guard means a stale scan can never land after reset/close; closing resets to
  idle. No stuck "scanning" state.

**Files changed:**

* `src/components/closet/uploadFlow.ts` *(new)* — reducer + `UPLOAD_COPY`.
* `src/components/closet/uploadFlow.test.ts` *(new, 9 tests)* — reducer
  transitions + copy-honesty guard.
* `src/components/closet/UploadGarmentModal.tsx` — rewritten onto the reducer +
  archiving/archived states.
* `src/app/App.test.tsx` — +1 test for the REJECT path (selecting a non-image →
  error + stays on the dropzone); the only upload path reachable in jsdom, so it
  locks the `handleFile → dispatch → render` wiring.
* `src/styles/archive-theme.css` — `.archived` card/seal styles + `pulseSeal`.
* `docs/AI_IMAGE_PIPELINE.md` — disambiguate the "Phase 3" naming collision,
  honest current-flow wording.
* `docs/QA_CHECKLIST.md` — refreshed upload section with the ritual + persistence
  checks.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 80/80 (was
70; +10) · `npm run lint` ✅ · `npm run build` ✅ (76 modules; CSS 32.1→33.3 kB,
JS 198.7→202.6 kB).

**Known limitations / deferred:**

* **Visual-unverified (the warning).** The four commands are static + unit only
  and CANNOT reach the ritual: jsdom has no canvas, so the scan→review→archived
  UI flow can't be driven in a test — the **reducer (plus the canvas-free REJECT
  path) is the only testable surface**. The scan sweep, "Sealing…" beat,
  "Archive Piece created" card, and
  the hand-off into the filmstrip highlight all need a one-time `npm run dev`
  eyeball. Green ≠ "ritual works".
* The scan shows an abstract sweep (not the live image) during scanning; the full
  preview appears at review. Showing the image under the sweep would need a
  second early file read — deferred as not worth the extra async edge.
* No hard scan-timeout: the realistic failure (undecodable image →
  `img.onerror`) is handled by `catch → SCAN_FAIL`; a timer for the pathological
  "neither onload nor onerror fires" case was intentionally skipped as scope
  creep.
* No archive "number" (no sequential field in the domain); the archived card
  shows the **date added** instead, per the spec's "if available".

**Codex review ready?** Yes — with the explicit caveat that Phase 3 is a *felt*
interaction whose acceptance criteria are visual; the reviewer/user should run
`npm run dev` and walk upload → scan → suggestion → confirm → Archive Piece → rail
once. Flow logic, persistence, error/cancel paths, and copy-honesty are covered
by the suite.

### Suggested next prompt (Phase 4)

> "Read PLAN.md first. Phase 3 (upload→archive ritual) is complete; optionally
> eyeball it with `npm run dev` first. Now do Phase 4 only — Mannequin & Mirror
> Preview Upgrade: strengthen the stylized 2.5D layered preview (body zones,
> layering, fit-check summary) WITHOUT claiming real 3D try-on. Much already
> exists (`MannequinPreview`, zone CSS) — audit first, then targeted polish. No
> real AI/3D. Keep changes small, update PLAN.md, run typecheck/test/lint/build,
> and document the visual-unverified caveat honestly."

### Phase 3.5 preflight cleanup (2026-06-08)

Pre-Phase-4 cleanup of the two Codex Phase-3 warnings (no critical blockers).
**Verdict: PASS** — both fixed, suite green, no new warnings.

**Warning 1 — corrupted images could be archived as broken images.**
`downscaleDataUrl` swallowed image-decode failures and returned the original
(undecodable) data URL, so a corrupt *image-MIME* file passed validation and
`SCAN_FAIL` was unreachable. Fix: the `loadImage` decode now runs **outside** the
catch, so a decode failure propagates → `processImageFile` rejects →
`UploadGarmentModal`'s existing `catch → SCAN_FAIL` shows the error state and no
garment is saved. The catch now only covers the benign canvas-unavailable case
(the image already decoded). Error copy upgraded to "This image could not be
read — the file appears to be damaged. Please choose a different clothing photo."

**Warning 2 — blank names silently became "Untitled Piece" with confirm always
enabled.** Added one shared predicate `isNameMissing(name)` (domain) and gated
the UI on it: "Confirm Archive Piece" (upload) and "Save changes" (editor) are
**disabled** when the name is blank/whitespace, with helper text ("Name this
archive piece before confirming/saving.") and an `aria-invalid` red cue on the
field. `normalizeDraft` keeps its "Untitled Piece" fallback as a safety net, but
the UI no longer lets a blank name reach it. *(The editor is included per the
task's explicit "local to the upload/editor flow" scope — both surfaces shared
the silent-name bug; this is not scope creep into Phase 4.)*

**Files changed:**

* `src/lib/image/imageFileUtils.ts` — decode failure now propagates (no silent
  fallback to the undecodable source).
* `src/lib/image/imageFileUtils.test.ts` *(new, 4 tests)* — decode boundary
  (corrupt rejects / valid resolves) for `downscaleDataUrl` + `processImageFile`
  via a stubbed `Image`.
* `src/domain/garmentDraft.ts` — new `isNameMissing` predicate.
* `src/domain/garmentDraft.test.ts` — +2 tests for `isNameMissing`.
* `src/components/closet/UploadGarmentModal.tsx` — gate Confirm on the name;
  premium decode-error copy.
* `src/components/closet/GarmentEditor.tsx` — `GarmentFields` `nameInvalid` prop;
  gate the editor Save on the name.
* `src/components/closet/GarmentEditor.test.tsx` *(new, 1 test)* — editor
  required-name wiring (clear → Save disabled + hint → type → re-enabled).
* `src/styles/archive-theme.css` — `aria-invalid` field cue.
* `docs/QA_CHECKLIST.md` — corrupted-image + required-name manual checks.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 87/87 (was
80; +7) · `npm run lint` ✅ · `npm run build` ✅ (77 modules; CSS 33.3→33.4 kB,
JS 202.6→203.1 kB).

**Remaining limitations:**

* The corrupt-image *integration* (real file → real decode → SCAN_FAIL → no
  garment) still can't run in jsdom (no canvas); the **two halves are unit-tested
  separately** — decode rejects (`imageFileUtils.test.ts`), and the reducer's
  `SCAN_FAIL → error` carries no draft so confirm is impossible (`uploadFlow`
  tests). The full chain remains eyeball-only.
* Upload-review also can't be reached in jsdom, so the required-name gate is
  proven by the pure `isNameMissing` test **plus the editor integration test**
  (same predicate, same disabled+hint pattern) rather than a direct
  upload-review test.

**Is Phase 4 safe to begin?** Yes — both warnings resolved, none introduced, the
suite is green. The only carry-forward is the standing visual-unverified caveat
(a one-time `npm run dev` eyeball of upload + a deliberately-corrupt file +
blank-name confirm is recommended, non-blocking). Use the "Suggested next prompt
(Phase 4)" above.

### Phase 4 audit (2026-06-08)

Before coding, audited the mannequin/mirror surface:

* **The mannequin already meets the Phase 4 bar.** `MannequinPreview` renders a
  tall, faceless SVG silhouette and maps each filled slot onto a body zone via
  `CATEGORY_META[slot].zone` → `.zone-{torsoOuter|torso|legs|feet|accessory}`,
  layering the garment photo as a matted panel (accent bar + name tag, vignette,
  `mix-blend-mode: multiply`). Empty slots render `.mannequin__empty`
  placeholders with the category label. So body-zone rendering, layering, and
  empty placeholders (Phase 4 items 2–3) already exist and are correct — they
  were just **untested**.
* **`FitCheck` already exists** — a deterministic palette/tone/style/notes read in
  the inspector, no AI. Restore updates the preview because `MannequinPreview`
  reads `currentOutfit` and `restoreOutfit` sets it (both already tested at the
  provider level).
* **The gap is the Mirror.** `MirrorPreview` (full variant) is just the mannequin
  in a chrome frame + shimmer — "decorative empty glass" with no outfit summary,
  category labels, or honest 2.5D wording. That is exactly what Phase 4 item 4
  flags.

**Plan (targeted, no rebuild):** add a caption to the full Mirror — an
archive-style title ("Mirror composition", to avoid colliding with the inspector's
"Current fit"), an honest "2.5D layered styling preview" label, selected category
chips, a layer count, and a composition-framed silhouette hint (a new pure
`silhouetteHint` helper, deliberately distinct in kind from FitCheck's checklist
notes). Add zone-mapping tests proving routing (right zone filled, wrong zone
empty) + an empty-state test. Leave the working mannequin alone.

### Phase 4 results (2026-06-08)

**Verdict: PASS.** Per the audit, the mannequin already mapped garments to body
zones correctly, so Phase 4 was **targeted polish + the missing Mirror summary +
the missing tests**, not a rebuild.

**What changed:**

* **Mirror upgrade (the gap).** The full Mirror view now renders a composition
  **caption** below the glass: an archive-style title ("Mirror composition"), an
  honest **"2.5D layered styling preview"** label, **selected category chips**
  (with color dots), a **layer count** (`n/5 layers`), and a single
  composition-framed **silhouette hint**. Empty → "Select archive pieces to build
  a fit." The mirror now reinforces the outfit instead of reading as decorative
  glass. (The compact scene mirror in the studio is unchanged.)
* **New pure helper `silhouetteHint(selection)`** (domain) — returns the next
  layer to style ("Torso layer open…", "Complete the silhouette with shoes.",
  "Full silhouette — every layer styled."), `null` for empty. Deliberately framed
  around *layers / silhouette* so it reads distinctly from the inspector's
  FitCheck notes beside it on the Mirror view.
* **Honest 2.5D direction reinforced** — no copy claims real 3D try-on / cloth
  simulation / body fitting; the explicit "2.5D layered styling preview" label is
  now surfaced. Stale "AI guess" wording in `ARCHITECTURE.md` cleaned up too.
* **The mannequin itself was left alone** — it already meets the bar (tall,
  faceless, editorial, working zones, elegant empty placeholders); Phase 4 adds
  the test coverage it lacked.

**Files changed:**

* `src/domain/outfitTypes.ts` — new `silhouetteHint` helper.
* `src/domain/outfitTypes.test.ts` — +4 tests for `silhouetteHint`
  (empty / partial / filled).
* `src/components/studio/MirrorPreview.tsx` — full-variant composition caption.
* `src/components/studio/MannequinPreview.test.tsx` *(new, 6 tests)* — zone
  routing (each category → its zone, and **not** other zones) + empty-state.
* `src/components/studio/MirrorPreview.test.tsx` *(new, 2 tests)* — caption shows
  the honest "2.5D" label + empty CTA (and never a 3D-try-on claim); a selected
  piece appears as a chip and on the mannequin.
* `src/styles/archive-theme.css` — `.mirror__caption` / chips / hint styles.
* `docs/ARCHITECTURE.md` — mirror responsibility + honest upload wording.
* `docs/QA_CHECKLIST.md` — Phase 4 mannequin/mirror manual checks.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 99/99 (was
87; +12) · `npm run lint` ✅ · `npm run build` ✅ (77 modules; CSS 33.4→34.3 kB,
JS 203.1→204.5 kB).

**Known limitations / deferred:**

* **Visual-unverified (standing caveat).** The zone tests prove garment→zone
  *routing*, but whether the mannequin + new mirror caption read premium at the
  Mirror view's two-column width is **eyeball-only** — the caption adds vertical
  space below the chrome frame; check at ~1280px. Green ≠ "reads premium".
* `FitCheck` (inspector) and the mirror `silhouetteHint` both speak to outfit
  completeness on the Mirror view; they are intentionally **different in kind**
  (FitCheck = editorial palette/tone/notes; mirror = one silhouette/layers line),
  not merged — a conscious choice, noted so it isn't read as accidental
  duplication.
* Saved-outfit-restore → preview update is covered **transitively** (the provider
  `restoreOutfit` test sets `currentOutfit`; the `MannequinPreview` zone tests
  prove it reads `currentOutfit`) rather than by one end-to-end restore→mannequin
  test.

**Codex review ready?** Yes — with the standing visual caveat (one `npm run dev`
walk of select-per-category → zone updates, clear, save, restore, reload, at
~1280px). Routing, the helper, and persistence are covered by the suite.

### Suggested next prompt (Phase 5)

> "Read PLAN.md first. Phase 4 (mannequin/mirror) is complete; optionally eyeball
> the Mirror view with `npm run dev` first. Now do Phase 5 only — Saved Outfit
> Board Polish: make saved looks feel like an editorial archive wall (mini
> thumbnails, vibe label, date, restore/delete) without backend or new deps. Much
> already exists (`OutfitWallBoard`, `SavedOutfitCard`) — audit first, then
> targeted polish. Keep changes small, update PLAN.md, run
> typecheck/test/lint/build, and document the visual-unverified caveat honestly."

### Phase 5 audit (2026-06-08)

Before coding, audited the saved-outfit surface:

* **`SavedOutfitCard` already shows** the cover hue strip, a 5-cell strip of real
  garment thumbnails (empty cells for unfilled slots), the look name, a piece
  count + created date, and **Restore** (mirror icon) + **Delete** (trash,
  `aria-label`) actions.
* **`OutfitWallBoard`** (the Outfits view) is a `saved-grid` of cards with a
  "Save current look" button and an `EmptyState`; **Restore** re-opens the
  Mirror; **Delete** is `window.confirm`-guarded and calls `removeOutfit` (the
  reducer filters `savedOutfits` only — garments are untouched).
* So the board, thumbnails, restore, delete, and persistence already work. The
  **gaps vs the Phase 5 spec are: no vibe label and no category labels on the
  card**, and the empty-state copy is plain. The `SavedOutfit` domain type has no
  `vibe` field.

**Plan (targeted, no rebuild, no domain migration):** derive a deterministic
`vibe` inside `generateFitCheck` (from dominant tags / tone / completeness — no
AI), surface it + a category-labels line on `SavedOutfitCard`, sharpen the
empty-state copy, and render a stale look (garments since deleted) gracefully.
Tests: vibe (incl. the alphabetical tie-break the card label leans on),
card render + restore/delete callbacks, board empty state, and **provider-level**
proof that deleting a look keeps every garment.

### Phase 6 results (2026-06-08)

**Verdict: PASS.** A docs-accuracy pass — the implementation's *rendered* copy was
already honest, so this reconciled the docs / skills / CLAUDE.md with the build
and created the Codex handoff. No product features, no scope creep.

**Audit summary (code-vs-docs delta):**

* A grep for risky terms (AI / detect / recogni / 3d / try-on / cloth simulation
  / accurate fit / body measurement) found **no misleading user-facing copy** —
  every hit was a test name, an honest "mock / not AI" disclaimer, a "(future)"
  label, or the `UPLOAD_COPY` honesty test itself.
* The main stale doc was **`ROADMAP.md`** (an older phase numbering that
  conflicted with PLAN.md, plus "tests (25)" and "AI guess"). A few docs still
  said "AI Guess" (pre-Phase-3 wording) and "(that is Phase 2)" for background
  removal.
* `QA_CHECKLIST.md` was already comprehensive (built up across phases) — no change.

**What changed (docs + copy only):**

* **`docs/ROADMAP.md`** — rewritten to match PLAN's phases 1–7 + a clearly-labeled
  **Future** section (background removal, real Vision API, Three.js/R3F room,
  try-on research) that does not imply those exist.
* **`CLAUDE.md`** — honest core-loop + "mock suggestion" wording; an explicit
  **acceptable / forbidden wording** list; roadmap section realigned to PLAN; a
  new "Phase discipline & review" section (PLAN.md first, next-incomplete-phase
  only, Codex for external review); test-coverage line updated (100+).
* **`docs/ARCHITECTURE.md`** — added the `uploadFlow` **state machine**; fixed the
  stale "(that is Phase 2)" background-removal label; renamed "Mock AI analysis"
  → "Mock analysis (no real AI)".
* **`docs/AI_IMAGE_PIPELINE.md`** — de-phased the current-pipeline header; noted
  the Phase-3.5 **decode rejection**; added an explicit "does not perform real AI
  product recognition" line and the 3D/GLB/R3F + candidate-search / cutout future
  items.
* **`docs/CODEX_REVIEW.md`** *(new)* — project summary, implemented phases,
  expected MVP behavior, non-goals, commands, high-risk areas, known limitations,
  PASS/WARN/BLOCK criteria, copy-paste review prompt.
* **`.claude/skills/`** — `product-vision` + `ai-image-pipeline` de-"AI guess"-ed
  (+ a PLAN-first "Working here" note); `testing-harness` coverage note updated.
  (`ui-style-guide` was already accurate — left as-is.)
* **Code comments only** — `garmentTaxonomy.ts`, `color.ts`: "mock AI" → "mock
  analyzer" (no functional change; bundle unchanged).

**Files changed:** `docs/ROADMAP.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`,
`docs/AI_IMAGE_PIPELINE.md`, `docs/CODEX_REVIEW.md` *(new)*,
`.claude/skills/{product-vision,ai-image-pipeline,testing-harness}.md`,
`src/domain/garmentTaxonomy.ts`, `src/lib/color.ts`, `PLAN.md`.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 109/109
(unchanged — comment-only code edits) · `npm run lint` ✅ · `npm run build` ✅.

**Remaining limitations:**

* "Docs match implementation" is a **human-judgment** reconciliation, not an
  automated check — code↔doc drift could re-appear in a future phase; the risky-
  term grep is the cheap re-check.
* `QA_CHECKLIST.md` and the visual claims remain **eyeball-verified** (no headless
  browser).

**Is Phase 7 safe to begin?** Yes — docs are reconciled and honest, and
`docs/CODEX_REVIEW.md` exists as a working handoff. Phase 7 only needs to refine
the review file and run the actual review. All four commands green.

### Suggested next prompt (Phase 7)

> "Read PLAN.md first. Phase 6 (architecture/docs hardening) is complete. Now do
> Phase 7 only — Codex Review Preparation: refine `docs/CODEX_REVIEW.md` into the
> final external-review handoff (confirm commands, risk areas, known limitations,
> PASS / PASS WITH WARNINGS / BLOCK criteria, copy-paste review prompt), make sure
> all verification commands are run and documented, and update PLAN.md. Do not add
> features or new docs beyond the review handoff. Keep it tight; run
> typecheck/test/lint/build. **Re-run the four commands FIRST and re-confirm
> CODEX_REVIEW.md's test count / 'all green' claims before trusting them — those
> numbers rot silently.** Optional durable safeguard: a tiny test asserting the
> rendered honest-label constants (e.g. the mirror's '2.5D layered styling
> preview') never match `/real 3d|try-on|cloth simulation/i`, turning the
> recurring manual copy-grep into a standing check."

### Visual QA & UI Polish (2026-06-08)

**Verdict: PASS — demo-ready.** Real browser screenshots (headless Chrome driven
by a small DevTools-Protocol script over Node's built-in WebSocket — **no new
deps**) were captured **and visually inspected**, converting the standing
"eyeball-only" caveat into actual verification for the key states.

**Documentation warning fixed:** `README.md` "AI-suggested classification" →
"local demo classification (a draft metadata suggestion)"; also corrected a stale
"Phases 1–5" line.

**Captured & inspected (1280px unless noted):**

* **First load (1280 / 860 / 560)** — premium dark studio with a guiding "Your
  studio is empty" prompt; sidebar collapses to icons at 860/560; the overlay
  stays readable. No broken layout.
* **Studio (populated)** — the clothing rack and bottom filmstrip show real
  garment thumbnails; the faceless mannequin is central. Clothes are the focus.
* **Closet** — premium editorial cards: large garment image as the hero, serif
  name, brand eyebrow, color swatch + tags, category tabs. Not an ecommerce grid.
* **Mirror (styled)** — the mannequin wears the outfit (overcoat / tee / trousers
  / derby mapped to body zones) in the chrome glass; the Current Fit inspector +
  "Fit Check · Editorial 4/5" sit beside it. No 3D claims.
* **Saved board** — the card reads editorial: vibe label ("TAILORED SILHOUETTE"),
  garment thumbnail strip, "Outerwear · Top · Pants · Shoes · Jun 8", "Restore
  fit" + a quiet delete.
* **Upload modal** — clean, centered dropzone ("Drop a clothing photo").
* **Responsive closet (860 / 560)** — 2-col then 1-col; no overflow; rail
  scrolls; selected-state badge visible.

**One small polish applied:** the tall mirror glass can push the Mirror caption's
"2.5D layered styling preview" label below the fold on short (~900px) viewports,
so the honest framing is now also surfaced in the always-visible **Mirror
subtitle** ("Style the mannequin — a 2.5D layered preview"). One-line copy change
in `views.ts`.

**No other issues found** — the app is already polished (no layout/clipping/
off-brand problems), so no further changes were forced (per "polish only obvious
issues").

**Files changed:** `README.md`, `src/components/studio/views.ts`, `PLAN.md`. (The
CDP screenshot driver lives in OS temp, not the repo.)

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 109/109 ·
`npm run lint` ✅ · `npm run build` ✅.

**Remaining (manual / deferred):** the full real-image **upload ritual** (canvas
re-encode, dominant-color sample, the live image under the scan sweep) is the
Image Processing Upgrade's territory — deferred as instructed. In a *real* browser
the canvas path works, so a future pass could even screenshot the live scan;
jsdom still can't. `docs/QA_CHECKLIST.md` is already comprehensive and was left
unchanged.

**Can the Image Processing Upgrade begin?** Yes — the MVP is visually demo-ready
and verified, all four commands are green, and no visual blockers remain.

### Suggested next prompt (Image Processing Upgrade)

> "Read PLAN.md first. Visual QA passed (demo-ready). Begin the Image Processing
> Upgrade: real-image handling — background removal for flat-lay photos, smarter
> dominant-color/palette extraction, full-resolution Blobs in IndexedDB (keep
> thumbnails in metadata records), and showing the live image under the scan
> sweep. Keep the local / on-device, no-real-AI, no-3D constraints; audit
> `imageFileUtils.ts` first; keep changes small and verified; update PLAN.md and
> run typecheck/test/lint/build. A reusable **headless-Chrome + CDP screenshot
> harness** was built during Visual QA (Node built-in WebSocket, no deps — it
> drives Load sample → studio/closet/mirror/board/upload at 1280/860/560 and
> reads the PNGs). **Re-use it to re-shoot the populated states after** touching
> the image pipeline — that's exactly what those views exercise (live scan,
> cutouts, thumbnail quality); in a real browser the canvas path runs, so the
> full upload ritual is screenshot-able there even though jsdom can't."

### Phase 8 results — Product Match & Garment Asset Pipeline (2026-06-08)

**Verdict: PASS.** Evolved garments from a single `imageDataUrl` to a proper
**`GarmentAsset`** pipeline with an optional product/reference step — mock/demo
only, no real search or recognition. An **8-agent adversarial review** found 0
critical/high issues (1 LOW state-hygiene wart, fixed). The full upload ritual
(canvas-blocked in jsdom) was **visually verified end-to-end in real Chrome** via
the CDP screenshot harness.

**Audit:** all garment images were rendered from a raw `garment.imageDataUrl`
across 12 surfaces. Phase 8 routes every one through a single helper.

**What changed:**

* **Domain.** New `GarmentAsset` (original / display / thumbnail / cutout /
  reference URLs, `sourceUrl` / `sourceLabel`, `assetMode`) — **optional** on
  `GarmentItem` & `GarmentDraft` for backward compatibility.
  `getGarmentDisplayImage(garment)` (`displayImageUrl` → `originalImageUrl` →
  `imageDataUrl`) is the single read helper, defensive (tolerates
  missing/empty/wrong-typed assets). `buildUploadedAsset` is the upload default.
* **Product match.** `src/lib/productMatch/` — `ProductMatchCandidate` +
  `mockProductMatch` returning deterministic **local demo reference candidates**
  (manual entry always first). No network, no recognition, no brand fabrication.
* **Upload flow.** A new **skippable `reference` step** between `review` and
  `archiving`: attach demo candidates or manual product details, choose the
  archive **display image** (uploaded vs a reference URL). Confirm now comes from
  the reference step; the **required-name gate** guards both "Continue" and
  "Confirm". Every new garment gets an asset (built at scan).
* **Threading.** All **12** render surfaces now use `getGarmentDisplayImage`
  (the upload *review* preview intentionally keeps the uploaded photo).

**Adversarial review (8 agents) + fixes applied:**

* **Confirmed (1, LOW) — fixed:** clearing the reference-image URL while
  "Reference image" was the active display left a stale display + an incoherent
  disabled+active pill. Fixed by re-syncing the display (revert to `uploaded`)
  when the reference URL is edited/cleared.
* **Hardened:** `getGarmentDisplayImage` now ignores non-string url fields.
* **Honesty guard unified & strengthened:** one shared `FORBIDDEN_CLAIM_TERMS`
  regex (adds exact/official/recognize/search/match) guards both `UPLOAD_COPY`
  and the mock candidate strings (the review found the upload guard weaker).
* **Coverage closed:** a render-threading test (a product-reference garment
  renders its display image, not the raw one), an `updateGarment`-preserves-asset
  test, and a wrong-typed-asset test.

**Visual verification (real Chrome via CDP — the jsdom-blocked path):** drove
upload → demo scan → review → **reference step** → "Archive Piece created". The
reference step reads premium and honest (candidate cards "User-confirmed manual
archive entry" / "Ochre Footwear Reference" / "Sport Footwear Reference", optional
manual fields, display-image toggle); the archived card shows the chosen display
image and the piece enters the rail. Screenshots captured.

**Files changed:** new — `domain/garmentAsset.ts` (+test),
`lib/productMatch/{productMatchTypes,mockProductMatch}.ts` (+test),
`test/honesty.ts`; edited — `domain/{garmentTypes,garmentDraft}.ts` (+tests),
`components/closet/{uploadFlow.ts,UploadGarmentModal,GarmentCard,GarmentFilmstrip,
GarmentEditor}`, `components/outfit/{CurrentFitSlots,OutfitBuilder,SavedOutfitCard}`,
`components/studio/{ClothingRack,MannequinPreview,StudioScene}`,
`styles/archive-theme.css`, reducer/provider/storage tests, and the docs
(`CLAUDE.md`, `README.md`, `ARCHITECTURE`, `AI_IMAGE_PIPELINE`, `ROADMAP`,
`QA_CHECKLIST`).

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 129/129 (was
109; +20) · `npm run lint` ✅ · `npm run build` ✅ (JS 205→212 kB).

**Known limitations / deferred:**

* The reference-step **handlers** (pickCandidate / source toggles) live in the
  component and aren't unit-tested (the upload flow needs canvas — jsdom can't
  reach the reference step); they're covered by the reducer tests + the real-
  Chrome screenshot. Lower-value review gaps (per-surface render tests, a
  pill-state assertion) are noted, given one render-threading proof + the shared
  helper.
* `pickCandidate`'s brand-fill is dormant (the mock never returns a brand) —
  defensive for future real candidates.
* No real product search / recognition / background removal / cutout / 3D — by
  design; `GarmentAsset` is the **foundation** for those.

**Codex review ready?** Yes — green, backward-compatible (legacy garments render
via fallback; with/without-asset both round-trip in storage), honest (unified
guard), and the new flow is visually verified.

### Suggested next prompt (Image Processing Upgrade)

> "Read PLAN.md first. Phase 8 (garment asset pipeline) is complete — `GarmentAsset`
> + `getGarmentDisplayImage` are the seam. Begin the Image Processing Upgrade:
> populate the asset's `thumbnailImageUrl` / `cutoutImageUrl` (client-side
> background removal for flat-lay photos), smarter dominant-color extraction, and
> full-resolution Blobs in IndexedDB (thumbnails stay in metadata). Show the live
> image under the scan sweep. Keep local / on-device, no real AI/3D. Re-use the
> headless-Chrome + CDP screenshot harness (see the Visual QA section) to re-shoot
> the upload ritual + populated states after. Audit `imageFileUtils.ts` first;
> keep changes small and verified; update PLAN.md; run typecheck/test/lint/build."

### Phase 9 audit (2026-06-09)

Before changing code, audited the image/asset surface:

* **`GarmentAsset` already exists (Phase 8)** with `originalImageUrl` /
  `displayImageUrl` / optional `thumbnailImageUrl` / `cutoutImageUrl` /
  `productReferenceImageUrl` / `sourceUrl` / `sourceLabel` / `assetMode`. It had
  **no `croppedImageUrl`**. `getGarmentDisplayImage` resolved
  `displayImageUrl → originalImageUrl → imageDataUrl`.
* **Every render surface already threads `getGarmentDisplayImage`** (closet,
  filmstrip, rack, mannequin, mirror, saved cards, archived card) — verified in
  Phase 8 — so no surface needed re-pointing; only the helper and the asset shape
  needed extending.
* **Upload flow** (`uploadFlow.ts` reducer + `UploadGarmentModal.tsx`):
  `idle → scanning → review → reference → archiving → archived`. The asset is
  built at scan (`buildUploadedAsset`); the reference step can repoint
  `displayImageUrl` to a product reference. **There was no crop step.**
* **Mannequin** (`MannequinPreview.tsx`) already maps each slot to a CSS body
  zone (`.zone-*`, eyeball-verified geometry) with matted panels + `multiply`.
  Placement existed only in CSS — there was **no TS layer-preset object**.
* **Image utils** (`imageFileUtils.ts`): read → downscale (≤768px JPEG) → sample
  dominant color; a private `loadImage`; decode failures already propagate
  (corrupt-image rejection from Phase 3.5).
* **Tests** depending on old behavior: `garmentAsset.test.ts` (helper order),
  `uploadFlow.test.ts` (`SUGGESTED → review`), `MannequinPreview.test.tsx`
  (threads the display helper). All three were updated/extended.

**Key tension found (resolved):** the spec's recommended helper order puts
`croppedImageUrl` ABOVE `displayImageUrl`. Because `displayImageUrl` is already
the Phase-8 *resolved* choice (it can hold a user-picked product reference),
ranking a stored crop above it would silently override that reference — a
regression. Resolution: `cutout → display → cropped → original → imageDataUrl`
(documented deviation; the crop still renders because the crop step writes it
into `displayImageUrl`).

### Phase 9 results (2026-06-09)

**Verdict: PASS** (implementation was PASS WITH WARNINGS; the visual-unverified
warning was **resolved** by a real-browser verification pass — see "Phase 9
visual verification" below). Built the first real browser image-processing
foundation: turning a raw uploaded photo into a prepared 2D garment asset via a
manual crop step, plus a category-based mannequin layer-preset system and a
future-ready cutout stub. **No** real background removal, segmentation, product
recognition, or 3D — by design. All four commands green; full suite 129 → 160
(+31).

**What changed:**

* **Asset shape.** Added `croppedImageUrl` to `GarmentAsset`.
  `getGarmentDisplayImage` is now `cutoutImageUrl → displayImageUrl →
  croppedImageUrl → originalImageUrl → imageDataUrl` (deviation from the spec's
  literal order — see the audit; preserves the Phase-8 product-reference display
  choice; the discriminating test asserts a reference is **not** shadowed by a
  stored crop).
* **Manual crop step.** New `crop` status in the upload reducer
  (`idle → scanning → crop → review → reference → archiving → archived`). After
  the demo scan the user gets a **"Prepare display asset"** step: a live crop
  window over the photo driven by **Zoom / Horizontal / Vertical sliders**, with
  **Use crop / Use original / Reset crop**. (Sliders over a draggable box for
  reliability — this phase can't be eyeball-verified this session; see limits.)
  Confirming a crop sets `croppedImageUrl` + `displayImageUrl` + `assetMode:
  'cropped'`; skipping keeps `assetMode: 'uploaded'`.
* **Crop generation.** Pure geometry in `lib/image/cropGeometry.ts`
  (`cropRectFromControls` / `validateCropRect` / `clampCropRect` /
  `cropRectToPixels`, normalized 0–1 rects, NaN-safe). Canvas work in
  `lib/image/cropImage.ts` (`cropImageToDataUrl`) — crops from the
  already-downscaled thumbnail, re-encodes JPEG capped at 768px (quota-safe),
  propagates decode failure, gracefully no-ops when canvas is absent. Exported a
  shared `loadImageElement` from `imageFileUtils.ts`.
* **Layer presets.** New `domain/garmentLayout.ts` — `GarmentLayerPreset`
  (`anchor` / `scale` / `zIndex` / `fit` / `aspectHint`) + `getLayerPreset`. The
  mannequin consumes `fit` (`contain` for shoes/accessories so wide/odd pieces are
  not over-cropped; `cover` for body garments) and `zIndex` per category. `scale`
  and `aspectHint` are **reserved** foundation — not consumed yet (they position
  nothing today). **Zone geometry stays in CSS** (verified) — the preset carries
  the semantic layer, not duplicated percentages.
* **Cutout stub.** New `lib/image/garmentCutout.ts` — `CutoutResult` union +
  `attemptGarmentCutout` always returning `unavailable` with an honest reason
  (guarded against the forbidden-claims regex). No fake cutout UI.
* **Honest copy.** New `UPLOAD_COPY` crop strings ("Prepare display asset",
  "Crop the garment area", "…a local, manual crop… Background removal is a future
  step.") — covered by the existing `UPLOAD_COPY` honesty test.

**Deliberate deviations from the spec (with rationale):**

* **Helper order** — `displayImageUrl` ranked above `croppedImageUrl` (not below)
  to avoid regressing the Phase-8 product-reference display toggle.
* **"Outerwear above top"** — kept the eyeball-verified order (outerwear behind
  the top). The top's panel is geometrically *inside* the opaque outerwear panel,
  so stacking outerwear on top would fully occlude a selected top — a broken
  collage. True outerwear-above-top is deferred to the cutout era (transparent
  garments make the overlap readable). Encoded in the preset + documented.
* **Crop UI = sliders, not a drag box** — chosen for reliability because this
  session cannot run a real browser to eyeball a pointer-drag UI.

**Files changed:**

* New: `domain/garmentLayout.ts` (+test), `lib/image/cropGeometry.ts` (+test),
  `lib/image/cropImage.ts` (+test), `lib/image/garmentCutout.ts` (+test).
* Edited: `domain/garmentTypes.ts` (croppedImageUrl), `domain/garmentAsset.ts`
  (+test), `lib/image/imageFileUtils.ts` (export `loadImageElement`),
  `components/closet/uploadFlow.ts` (crop status/action/copy) (+test),
  `components/closet/UploadGarmentModal.tsx` (crop step UI + crop-safe display
  toggles), `components/studio/MannequinPreview.tsx` (apply preset),
  `styles/archive-theme.css` (crop step styles), docs (`ARCHITECTURE`,
  `AI_IMAGE_PIPELINE`, `ROADMAP`, `QA_CHECKLIST`, `CLAUDE.md`), `PLAN.md`.

**Tests added/updated (+31, 129 → 160):** crop geometry (11), helper order incl.
the reference-not-shadowed guard (+5), layer presets (8), cutout stub (2),
cropImage canvas-free behavior (3), upload reducer crop transitions (+4 incl.
`SUGGESTED → crop`). Corrupted-image rejection and required-name gates were
preserved and still pass.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 160/160 ·
`npm run lint` ✅ · `npm run build` ✅ (81 modules; CSS 35.96 kB, JS 216.9 kB).

**Known limitations / deferred:**

* **Visual-unverified (the standing caveat, sharper this phase).** The crop step
  is a *felt* canvas/pointer interaction that jsdom cannot run, and **no real
  browser was available this session** (the prior CDP screenshot harness lived in
  OS temp and is gone). So the crop window framing, slider feel, the generated
  crop's quality, and the mannequin presentation are **not eyeball-verified** —
  only the pure geometry, the reducer transitions, and the canvas-free fallbacks
  are. **Strongly recommended before relying on it:** run `npm run dev`, upload a
  flat-lay, crop, and confirm the crop renders in closet/filmstrip/mannequin/
  mirror, then re-shoot the populated states. **Check one thing specifically:** the
  mannequin's new `object-fit: contain` on **shoes and accessories** is the only
  change made to a previously-eyeball-verified surface (it should show the whole
  shoe rather than a cropped band — confirm it reads better, not worse). The
  `zIndex` values match the existing CSS, so stacking is unchanged.
* No real background removal / cutout / segmentation / product recognition / 3D —
  `croppedImageUrl` + the `cutoutImageUrl` field + `garmentCutout.ts` are the
  **foundation**, not the feature.
* The crop step's React handlers (slider→rect→canvas) aren't unit-tested (canvas
  needs a browser); they're covered by the pure geometry + reducer tests + the
  canvas-free `cropImage` tests, with the live path eyeball-only.
* Re-cropping after leaving the crop step isn't offered (no "back to crop") — kept
  lightweight; a future enhancement.

**Codex review ready?** Yes — green, backward-compatible (legacy + Phase-8
garments still render; the product-reference toggle is preserved and guarded by a
test), honest (crop/cutout copy guarded), with the single explicit carry-forward
that the crop interaction is visually unverified this session.

### Phase 9 visual verification (2026-06-09)

**Verdict: PASS — the visual-unverified warning is resolved.** Phase 9's crop UI
and mannequin presentation were verified in **real headless Chrome** driven over
the DevTools Protocol from Node 24 (built-in `WebSocket`, no new deps — the same
class of harness prior phases used; rebuilt in OS temp, not committed). The dev
server ran on `localhost:5174` (5173 was occupied).

**What was visually verified (screenshots captured + inspected, plus DOM/IDB
assertions):**

* **Crop step renders correctly.** "Prepare display asset" / "Crop the garment
  area" with the flat-lay on a light matte panel and Zoom / Horizontal / Vertical
  sliders; at zoom 1 the H/V sliders + "Reset crop" are disabled and the primary
  button reads "Continue" (no-op crop). The crop window is **not clipped** — at
  zoom 1 it exactly covers the image box (measured 216×288 == image 216×288).
* **Sliders update the crop frame.** Zooming + panning shrank/moved the window
  (measured 98×131, offset up-right) with the outside dimmed and an accent
  border; **Reset crop** restored it to the full image (back to 216×288).
* **Use crop works end-to-end.** The generated crop flowed into review (the
  preview visibly changed to the cropped framing), and the **persisted IndexedDB
  record** showed `assetMode: 'cropped'`, a non-empty `croppedImageUrl`, and
  `displayImageUrl === croppedImageUrl`. **Use original** archives with
  `assetMode: 'uploaded'` and no crop (reducer-tested; the identity-crop button
  is the same path).
* **Cropped asset renders across surfaces** — filmstrip (the new piece entered
  the rail), closet card, mannequin, and mirror.
* **`object-fit: contain` for shoes & accessories** confirmed via computed style
  in the live DOM: feet → `contain` (z-index 3), accessory → `contain`
  (z-index 5), while torso/outerwear/legs → `cover`. The mirror screenshot shows
  the **whole** wide shoe and the full accessory circle (not a cropped band).
* **Phase-8 product-reference NOT shadowed by a crop.** A garment carrying BOTH a
  `croppedImageUrl` and a `product-reference` `displayImageUrl` rendered the
  **reference** image (blue), never the crop (green) — verified by exact full-src
  comparison on both the mannequin (all 6 zone assertions true) and the closet
  cards (all 4 assertions true), and visible in the screenshots.
* **Legacy garments (no `asset`) still render** their `imageDataUrl` everywhere
  (verified by exact src match, orange tile).
* **Layering** — the top (z-index 2) renders in front of outerwear (z-index 1) as
  designed; the mannequin reads as a clean collage, not broken.

**Fixes made:** none — no visual issues were found. (The only mismatches were in
the verification *script's* selectors/timing, not the app; corrected in the
harness.)

**Commands re-run after verification (all green):** `npm run typecheck` ✅ ·
`npm test` ✅ 160/160 · `npm run lint` ✅ · `npm run build` ✅ (81 modules; CSS
35.96 kB, JS 216.87 kB) — unchanged (verification made no source edits).

**Remaining warnings:** none material. The verification synthesized flat-lay /
seeded garments rather than real-world photography; everyday device photos may
warrant a casual human spot-check, but every Phase-9 acceptance criterion is now
browser-verified. **Phase 10 (real cutout / background removal) is safe to begin.**

### Suggested next prompt (Phase 10 — real cutout / background removal)

> "Read PLAN.md first. Phase 9 (manual crop / 2D asset compiler) is complete —
> `GarmentAsset.croppedImageUrl`, the crop step, `lib/image/cropGeometry|cropImage`,
> `domain/garmentLayout`, and the `garmentCutout` stub are the seam. FIRST do a
> one-time `npm run dev` eyeball of the crop step (upload → Prepare display asset →
> crop → render in closet/mannequin) since this phase was not browser-verified.
> Then begin client-side background removal for flat-lay photos: implement
> `attemptGarmentCutout` (on-device WASM segmentation → transparent PNG), populate
> `asset.cutoutImageUrl`, and only THEN consider letting cutout win in
> `getGarmentDisplayImage` for the mannequin (resolve cutout-vs-reference
> precedence explicitly). Keep local / on-device, no real product recognition / 3D.
> Keep changes small and verified; update PLAN.md; run typecheck/test/lint/build."

### Phase 10 results — Real Cutout / Background Removal Foundation (2026-06-09)

**Verdict: PASS.** Implemented a **real, local, on-device** background-removal
foundation, browser-verified end-to-end. No ML/cloud/recognition/3D, **no new
dependencies**. All four commands green; full suite 160 → 175 (+15).

**What was implemented:**

* **Real cutout (`lib/image/garmentCutout.ts`).** Replaced the stub with a real
  **edge-seeded flood fill**: sample the border for a median background color,
  gate on border uniformity (busy bg → `unavailable`), flood-fill
  background-colored pixels *connected to the border* to transparent (interior
  logos survive), classify by removed fraction (too little/too much → `failed`),
  and encode a transparent **WebP** (`cutoutImageUrl`). This is genuine
  background removal — NOT ML segmentation, cloud AI, product recognition, or 3D.
  The canvas work sits behind a swappable **`CutoutDeps`** adapter so the branch
  logic is unit-testable without a browser AND a future ML model can drop in
  without touching the UI/contract.
* **Typed result model.** `CutoutResult` = `success { cutoutImageUrl,
  maskImageUrl?, warnings?, source }` | `unavailable { reason }` | `failed
  { reason }`. Never `success` without a real cutout image; `unavailable`/`failed`
  are non-blocking and never throw into the caller.
* **Upload flow.** New optional **`cutout` step** after crop, before review
  (`scanning → crop → cutout → review → reference → archiving → archived`).
  Opt-in "Prepare cutout" → processing → **before/after** preview (cutout on a
  checkerboard) → "Use cutout" / "Continue without cutout". `unavailable`/`failed`
  show an honest message and stay non-blocking. No "Retry" (the flood fill is
  deterministic — a no-op button would mislead).
* **Honest copy.** New `UPLOAD_COPY` cutout strings ("Local background removal",
  "Experimental garment cutout", "Local preview only", "Continue without cutout")
  + `CUTOUT_REASONS` — all guarded by the FORBIDDEN_CLAIM_TERMS honesty test.

**Exact asset precedence decision:** `displayImageUrl` is the **single source of
truth** for what renders — it always holds the user's *latest intentional* display
choice, kept in lockstep with `assetMode` (`uploaded`/`cropped`/`cutout`/
`product-reference`). `getGarmentDisplayImage` now resolves `displayImageUrl →
cutoutImageUrl → croppedImageUrl → originalImageUrl → imageDataUrl` (display moved
ABOVE cutout vs Phase 9). A generated cutout is **never auto-applied** — only an
*accepted* cutout sets `displayImageUrl`+`assetMode` to `cutout`. `assetMode` is
the explicit display-source preference field.

**Product-reference compatibility result:** **intact.** A garment that carries a
stored cutout but whose chosen display is a product reference renders the
**reference** — verified by a discriminating unit test AND in real Chrome (a
reference display is not shadowed by a cutout). The reference-step "Uploaded
photo" toggle restores the best prepared own-photo asset (cutout → crop →
original) via the extended `uploadedDisplay` helper.

**Files changed:**

* `lib/image/garmentCutout.ts` — rewritten (real impl + adapter) (+ rewritten test).
* `domain/garmentAsset.ts` — helper precedence (display above cutout) + doc (+ test updated).
* `components/closet/uploadFlow.ts` — `cutout` status + `APPLY_CUTOUT` + copy; `APPLY_CROP` now → cutout (+ test updated).
* `components/closet/UploadGarmentModal.tsx` — cutout step UI + handlers; `uploadedDisplay` extended to cutout→crop→original.
* `styles/archive-theme.css` — cutout step styles (before/after, checkerboard transparency, notes).
* Docs: `ARCHITECTURE`, `AI_IMAGE_PIPELINE`, `QA_CHECKLIST`, `CODEX_REVIEW`, `CLAUDE.md`, `PLAN.md`.

**Tests added/updated (+15, 160 → 175):** `garmentCutout.test.ts` rewritten (11
tests — pure flood fill keeps garment / drops background, busy → not-applied,
border uniformity, classifyRemoval, success/unavailable/failed/decode-error via
injected deps, never-success-without-encode, copy honesty); `garmentAsset.test.ts`
(accepted-cutout renders, **product-reference-not-shadowed-by-cutout**,
display-empty fallback); `uploadFlow.test.ts` (crop→cutout, APPLY_CUTOUT
accept/skip, failed-cutout-still-reaches-review/non-blocking, ignored-outside-step).

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 175/175 ·
`npm run lint` ✅ · `npm run build` ✅ (CSS 35.96→37.24 kB, JS 216.87→223.14 kB —
the cutout module + step; **no new deps**).

**Manual browser verification (real headless Chrome via CDP — the jsdom-blocked
path):** Three runs, screenshots inspected + IndexedDB asserted:
* **Accept** — clean flat-lay → "Prepare cutout" → real **transparent WebP**
  cutout shown on a checkerboard before/after → "Use cutout" → persisted
  `assetMode: 'cutout'`, `displayImageUrl === cutoutImageUrl`; renders (WebP) in
  closet, filmstrip, and on the mannequin torso. No edge fringe on the cream
  surfaces.
* **Unavailable** — busy/noisy background → honest "Background removal was
  unavailable for this image…", flow not stuck → "Continue without cutout" →
  archived `assetMode: 'uploaded'` (no fake cutout).
* **Skip** — "Continue without cutout" without preparing → archived
  `assetMode: 'uploaded'`.

**Remaining warnings:** cutout quality varies with the photo background (honest by
design — flood fill suits uniform flat-lays; ML segmentation is the future seam).
Cutout edge fringe on lossy real-world JPEGs over a non-cream backing is possible
(invisible on the cream mannequin/closet panels under `multiply`; covered by the
"quality varies" framing). WebP keeps cutouts quota-light; PNG is the silent
fallback.

**Is the next phase safe to begin?** Yes — green, browser-verified, backward
compatible (legacy + Phase 8/9 garments render; product-reference preserved and
test-guarded), honest, non-blocking.

### Phase 10 Hardening Patch (2026-06-09)

**Verdict: PASS.** Closed the Codex PASS-WITH-WARNINGS gaps. (Codex had already
fixed the one blocker — encoder exceptions escaping `attemptGarmentCutout`, now
wrapped to return `failed`/`encodeFailed`, with function-level coverage.) This
patch adds the missing modal-level and reload-level coverage, hardens the modal
against a thrown cutout, and refreshes stale "future" wording. All four commands
green; suite 176 → 180 (+4). No new features, no ML, no deps.

**What was fixed:**

* **Modal-level failure recovery (gap 1).** Added a defensive `try/catch` in
  `UploadGarmentModal.prepareCutout`: even though `attemptGarmentCutout` is
  non-throwing by contract, an unexpected throw (e.g. a future adapter) now falls
  back to an honest `failed` result instead of stranding the modal in the
  "working" state. The fallback string (`UPLOAD_COPY.cutoutFailed`) is covered by
  the existing copy-honesty guard.
* **Modal failure-recovery test** (`UploadGarmentModal.test.tsx`, new, 2 tests) —
  drives the **real upload modal** (mocking only the two canvas seams,
  `processImageFile` + `attemptGarmentCutout`): (a) a THROWN cutout → the modal
  recovers (failed message, not stuck working), the user continues without it,
  the **required-name gate still works**, and the piece archives end-to-end;
  (b) a reset (Discard) clears stale failed cutout state on the next upload.
* **Reload/persistence precedence tests** (`ArchiveProvider.test.tsx`, +2) through
  the **real provider + storage facade**: **Case A** — an accepted cutout survives
  reload (`assetMode: 'cutout'`, display + `cutoutImageUrl` intact,
  `getGarmentDisplayImage` returns the cutout, current/saved outfit refs resolve);
  **Case B** — a product-reference display survives reload **even with a stored
  cutout** (`assetMode` + display stay `product-reference`, helper returns the
  reference not the cutout, outfit refs resolve).
* **Stale docs/comments updated:** `domain/garmentTypes.ts` (the `GarmentAsset`
  doc + `cutoutImageUrl` comment no longer say "future / not produced today");
  `docs/ROADMAP.md` (Phase 10 ✅ added; background removal moved out of "Future";
  the future item is now ML/WASM segmentation + storage hardening);
  `docs/QA_CHECKLIST.md` (Phase 9 crop wording "Background removal is a future
  step" → "You can remove the background next"). Wording stays honest — local /
  experimental / quality-varies, not ML, not cloud, not recognition, not 3D.

**Files changed:** `components/closet/UploadGarmentModal.tsx` (defensive catch),
`components/closet/uploadFlow.ts` (`UPLOAD_COPY.cutoutFailed`),
`components/closet/UploadGarmentModal.test.tsx` *(new)*,
`app/providers/ArchiveProvider.test.tsx` (+2 reload tests),
`domain/garmentTypes.ts` (comments), `docs/ROADMAP.md`, `docs/QA_CHECKLIST.md`,
`PLAN.md`.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 180/180 (was
176; +4) · `npm run lint` ✅ · `npm run build` ✅ (CSS 37.24 kB, JS 223.39 kB; no
new deps).

**Browser smoke (real headless Chrome via CDP):** re-ran the accept / unavailable
/ skip paths post-patch — unchanged: accept → transparent WebP cutout persisted
`assetMode: 'cutout'`; busy background → honest "unavailable", non-blocking,
`assetMode: 'uploaded'`; skip → `assetMode: 'uploaded'`. (The patch's only runtime
change is a defensive catch that does not fire on the happy path.)

**Is Phase 11 now safe to begin?** Yes — the two hardening gaps Codex flagged
(modal-level recovery coverage, reload/precedence coverage) are closed, the modal
is hardened against a thrown cutout, docs are accurate, and all four commands are
green with a browser smoke re-confirm.

### Phase 11 audit (2026-06-09)

Before coding, audited image persistence:

* **Where data URLs live.** `GarmentItem.imageDataUrl` (a required ≤768px JPEG
  thumbnail) + `GarmentAsset.{originalImageUrl, croppedImageUrl, cutoutImageUrl,
  displayImageUrl}`. In practice these **duplicate**: `originalImageUrl ===
  imageDataUrl`, and `displayImageUrl ===` the chosen source (uploaded→original,
  cropped→cropped, cutout→cutout, product-reference→productReferenceImageUrl). So
  a cutout garment stores ~4–5 large strings, mostly dupes.
* **Display read path.** Every surface reads the **synchronous**
  `getGarmentDisplayImage(garment)` (`displayImageUrl → cutoutImageUrl →
  croppedImageUrl → originalImageUrl → imageDataUrl`). ~12 call sites.
* **Serialization.** `ArchiveProvider` persist effects call
  `saveGarments(state.garments)` directly; hydration loads garments into
  `HYDRATE`. `addGarment` is **synchronous** (the modal uses the returned garment
  for the celebration).
* **Backends.** Facade picks IndexedDB (`fit-archive` DB, single `kv` store,
  whole-array values) → localStorage (~5 MB) → memory. **In jsdom IDB is absent**
  → localStorage. localStorage already holds the large image strings (the real
  quota risk; Blobs can't live there — only IDB).
* **Deletion / refs.** Saved outfits reference garment **IDs only** (no images),
  so outfit-delete never touches image data. Garment-delete just filters. Seed
  garments (small procedural SVGs) are regenerated each `loadSampleArchive` via
  `ADD_GARMENTS` (not `addGarment`) — must NOT be blob-backed.

**Chosen model (the key decisions):**

* **Keep `getGarmentDisplayImage` synchronous; resolve blob refs → object URLs at
  hydration** (no async per-component hook, no UI changes).
* **Keep the `imageDataUrl` thumbnail in metadata always** as the durable
  fallback; **drop the duplicate** `originalImageUrl`/`displayImageUrl` (derive
  display from `assetMode`) and **blob-back only the distinct owned images**
  (`croppedImageUrl`, `cutoutImageUrl`) → `croppedImageRef`/`cutoutImageRef`. A
  missing blob degrades to the thumbnail, never a broken image.
* **Ref-conditional, backwards-compatible:** a garment is only blob-backed if it
  carries refs (only the modal attaches them). Legacy / Phase 8–10 / direct-add
  garments have no refs → dehydrate & hydrate are **passthroughs** → render and
  persist exactly as today.
* **Precedence keyed off `assetMode`** at hydrate (never "first ref present"), so
  a stored cutout never shadows a chosen product reference.
* Blob storage activates only when **IndexedDB is available**; otherwise graceful
  fallback to today's data-URL behavior.

### Phase 11 results — Asset Storage Hardening / IndexedDB Blob Pipeline (2026-06-09)

**Verdict: PASS.** Added an IndexedDB blob-backed asset store so heavy garment
image bytes live outside the metadata array, with full backwards compatibility,
preserved display precedence, and graceful fallback. **No** new product behavior,
ML, cloud, or dependencies. All four commands green (suite 180 → 204, +24) and the
real IndexedDB blob round-trip is browser-verified.

**Storage model chosen:** keep `getGarmentDisplayImage` **synchronous**; resolve
blob refs → object URLs at **hydration** (no async per-component hook, no UI
change). Keep the `imageDataUrl` thumbnail in metadata **always** (durable
fallback); blob-back only the distinct owned images (`croppedImageUrl`,
`cutoutImageUrl`) → `croppedImageRef`/`cutoutImageRef`; drop the duplicate
`originalImageUrl`/`displayImageUrl`; derive the display from `assetMode` at
hydrate. A missing blob degrades to the thumbnail — never a broken image.

**Blob store (`lib/storage/assetBlobStore.ts`):** a separate IndexedDB DB
(`fit-archive-assets`, `blobs` store) keyed by id. Small interface
(`put`/`get`/`getObjectUrl`/`delete`/`clear`). `put` resolves on the transaction
**commit** (so a ref never points at a blob that didn't land). The store owns
object-URL create/revoke (cached one-per-key — reused across re-hydrations, no
leak; revoked on delete/clear). `durable` is true only for IDB; a non-durable
memory fallback (IDB absent) makes blob-backing a no-op. Test-injectable.

**Bridge (`lib/storage/garmentAssetStorage.ts`):** `dehydrateGarmentForStorage`
(lean persist), `hydrateGarmentForRuntime` (resolve display blob, `assetMode`-keyed,
thumbnail fallback), `blobBackDraftAsset` (store a new upload's crop/cutout on a
durable store), `garmentBlobKeys` (cleanup), `dataUrlToBlob`. All **ref-conditional**.

**Migration / fallback:** **lazy, new-uploads-only** — existing garments are left
as data URLs and never transformed (no destructive migration). When IndexedDB is
unavailable (localStorage/memory backend), blob-backing is skipped and uploads
keep inline data URLs exactly as before. A failed `put` falls back to the data
URL; a missing blob on reload falls back to the thumbnail.

**Asset precedence result:** preserved. Hydration derives the display strictly
from `assetMode`, so a stored cutout blob is never resolved for a
product-reference garment. Proven by unit tests (`garmentAssetStorage.test.ts`)
**and** a provider reload test **and** the browser smoke.

**Product-reference compatibility result:** intact — a product-reference garment
that also carries a stored cutout blob still displays the reference after reload
(unit + provider + browser verified).

**Files changed:**

* New: `lib/storage/assetBlobStore.ts` (+test), `lib/storage/garmentAssetStorage.ts`
  (+test), `app/providers/ArchiveProvider.blobs.test.tsx`.
* Edited: `domain/garmentTypes.ts` (`AssetImageRef` + `croppedImageRef`/
  `cutoutImageRef`), `app/providers/ArchiveProvider.tsx` (resolve blob store +
  hydrate/dehydrate + blob cleanup on remove/reset),
  `components/closet/UploadGarmentModal.tsx` (async `handleArchive` + blob-back +
  double-submit guard) (+test), docs (`ARCHITECTURE`, `AI_IMAGE_PIPELINE`,
  `QA_CHECKLIST`, `CODEX_REVIEW`, `CLAUDE.md`, `PLAN.md`).

**Tests added/updated (+24, 180 → 204):** blob store CRUD / object-URL caching /
IDB-unavailable fallback (7); transforms — legacy passthrough, blob-back
durable/non-durable/put-failure, round-trip identity (cutout + cropped),
precedence after hydrate, missing-blob fallback, utilities (11); provider —
blob-backed cutout reload, product-reference-not-shadowed reload, **edit-doesn't-
leak-object-URL**, delete-cleans-blob, reset-clears-store, outfit-delete-keeps-blob
(6); modal — blob-backed upload stores a ref not a data URL (1). Existing 180
unchanged (ref-conditional = no regression).

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 204/204 ·
`npm run lint` ✅ · `npm run build` ✅ (CSS 37.24 kB, JS 223→228 kB; **no new deps**).

**Manual browser verification (real headless Chrome via CDP — IndexedDB path):**
upload → crop → accept cutout → archive. Confirmed: backend "IndexedDB · persistent";
persisted metadata is **lean + blob-backed** (`cutoutImageRef` present, cutout data
URL dropped, `displayImageUrl: ''`, thumbnail kept); **1 blob** in
`fit-archive-assets`. **After a real page reload** the cutout resolves to a `blob:`
object URL and **loads** in the closet and on the mannequin (the round-trip proof).
**Delete** → garment gone, UI stable, **asset blob count 1 → 0** (cleanup).

**Known limitations:**

* Blob-backing is **IndexedDB-only**; on the localStorage fallback (no Blob
  support) uploads keep inline data URLs — the pre-existing ~5 MB quota risk there
  is unchanged (documented). Pure-uploaded (no crop/cutout) and reference-only
  garments aren't deduped (only blob-backed garments are) — a minor future win.
* The memory blob store is session-only (used as a non-durable fallback and as the
  unit-test stand-in); it intentionally does not blob-back in production.
* No full-resolution originals are stored (we keep the downscaled thumbnail) — by
  design; full-res Blob storage remains future work.

**Codex review ready?** Yes — green, browser-verified, backwards-compatible (legacy
+ Phase 8–10 garments untouched), precedence-preserving, graceful fallback, no new
deps or product surface.

### Phase 11 Post-Codex Cleanup (2026-06-09)

**Verdict: PASS.** Codex reviewed Phase 11 as PASS WITH WARNINGS and fixed the one
correctness blocker (a partial blob-write could change the display after reload —
`hydrateGarmentForRuntime` now falls back to the inline cropped/cutout string
before the thumbnail, with regression coverage; suite at **205**). This pass
closes the remaining **documentation/comment** cleanup items only. No code
behavior changed, no new deps.

**Stale docs/comments fixed** (blob storage is no longer described as future —
the IndexedDB asset blob store exists as of Phase 11; future work is *hardening*,
not building it):

* `docs/ARCHITECTURE.md` — "Full-res images — add a Blob-per-record object store"
  → the store exists (Phase 11); remaining future work is atomicity, orphaned-blob
  cleanup, object-URL lifecycle, and a full-res storage strategy.
* `src/domain/garmentTypes.ts` — "Full-resolution Blob-per-record storage … is a
  documented Phase 2 extension" → cropped/cutout images are blob-backed now;
  only full-res storage remains future.
* `src/lib/storage/indexedDbStorage.ts` — "Phase 2 extension point: store …
  Blobs" → clarified this adapter is metadata-only and the separate asset blob
  store (Phase 11) holds the bytes; future work is atomicity/orphan cleanup/full-res.
* Two stragglers Codex's named list missed (caught by a tree-wide sweep):
  `.claude/skills/ai-image-pipeline.md` and the `docs/AI_IMAGE_PIPELINE.md`
  future-pipeline diagram line — both updated to "Phase 11: SHIPPED" with full-res
  still future. Wording stays honest — local/on-device, no cloud/AI/recognition/3D.

**Browser smoke (real headless Chrome via CDP — IndexedDB path):**
* **Cutout round-trip + delete** (re-run post-cleanup): backend "IndexedDB ·
  persistent"; lean blob-backed metadata + 1 asset blob; after a real reload the
  cutout resolves to a `blob:` object URL that loads in closet + mannequin; delete
  → UI stable, asset blob count 1 → 0 (cleanup).
* **Product-reference precedence** (new): uploaded a garment, accepted a real
  cutout (→ a stored cutout blob), then chose a product-reference image as the
  display. Persisted `assetMode: 'product-reference'` with `cutoutImageRef`
  present; **after a real reload the closet renders the reference image, not a
  `blob:` cutout URL** — the stored cutout never shadows the chosen reference.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 205/205 ·
`npm run lint` ✅ · `npm run build` ✅ (no new deps).

**Remaining warnings (intentionally deferred to Phase 12):** metadata + blob
writes are not atomic; a metadata failure after a successful blob put can leave an
orphaned blob; cached object URLs live until garment delete/reset/store-clear;
ML/WASM segmentation upgrade. None of these block Phase 12.

**Is Phase 12 safe to begin?** Yes — the blocker was fixed by Codex, the cleanup
items are closed, both browser smokes pass, and all four commands are green.

### Phase 12 results — Storage Atomicity, Orphan Cleanup, Object URL Lifecycle (2026-06-09)

**Verdict: PASS.** Hardened the asset storage system against failed/partial
writes, deletion, reset, and long sessions — without changing product behavior,
adding deps, or redesigning the app. All four commands green (suite 205 → 215,
+10) and the orphan sweep is browser-verified against real IndexedDB.

**Audit findings:** blob writes happen in the modal (`blobBackDraftAsset`,
committed on IDB `oncomplete`); metadata writes happen in the provider's persist
effect (`void saveGarments`, fire-and-forget, errors swallowed app-wide). On
*blob-success + metadata-fail*, the garment stays in-memory (renders via the
thumbnail fallback — never broken) but is absent from persisted metadata, so on
reload its blob is an **orphan**. *Metadata-success + blob-fail* → `put` returned
null → no ref → field stays a data URL (Phase 11). Delete cleans the garment's
blobs; reset clears the store; outfit-delete touches no blobs. Object URLs are
cached one-per-key in the store, revoked on delete/clear. **Key reframe:** because
the thumbnail is always kept, a missing blob degrades to the thumbnail — so an
orphan is wasted space, not a broken garment. Atomicity here is **disk hygiene,
not data-loss prevention**, which is why a startup sweep is proportionate and a
transactional rewrite is not.

**Atomicity / rollback strategy chosen — Approach C (conservative orphan
scanner):** after `HYDRATE`, a **fire-and-forget** `cleanupOrphanBlobs` deletes
any stored blob NOT referenced by a current garment, reclaiming a prior failed
save's orphan at next load. It is **never awaited** (startup unblocked) and **fails
closed** at every step: `store.listKeys()` itself returns `[]` on error; a
`listKeys` or referenced-set error deletes nothing; per-key delete errors don't
abort the sweep. Under-deletion is harmless (cleaned next load); over-deletion
would be permanent loss, so the bias is always to keep. *(Approach A eager rollback
and a `saveGarments → boolean` contract change were deliberately NOT done — the
persistence layer is fire-and-forget app-wide; surfacing only blob-upload quota
errors would be inconsistent, and the thumbnail fallback already prevents broken
garments. Documented as a known limitation.)*

**Orphan cleanup strategy:** `garmentBlobKeys` is the **single** owned-keys source
(only `indexeddb-blob` refs — never remote product-reference URLs or inline data
URLs), consumed by BOTH delete-cleanup and the sweep so they can't drift;
`archiveBlobKeys` dedups across the archive. The sweep runs at hydration; reset
clears the whole store; delete removes a garment's keys. **Race-safe within one
tab:** candidate keys are frozen before `HYDRATE` exposes uploads, then the
referenced set unions the just-hydrated garments with the live `garmentsRef`.
An ambiguous empty metadata load skips cleanup entirely, biasing toward
under-deletion rather than risking valid blobs.

**Object URL lifecycle strategy:** kept the store-owned per-key cache (one URL per
key, reused across re-hydrations, revoked on `delete`/`clear`/sweep). **No
ref-counting** — it would solve a problem the app doesn't have: hydrate resolves
exactly one display URL per garment and hydrated garments never change
display-source, so URLs are bounded by archive size with no leak path. Added
`listKeys()` to the store interface; documented + tested the lifecycle.

**Asset precedence result:** unchanged and still verified (product-reference →
reference; cutout → blob → inline → thumbnail; cropped likewise; uploaded →
thumbnail; legacy data URLs). The sweep only deletes *unreferenced* blobs, so it
cannot affect any garment's display.

**Product-reference compatibility result:** intact — re-confirmed by the existing
precedence tests (the sweep never touches a referenced blob, and a
product-reference garment's stored cutout blob remains stored).

**Files changed:** `lib/storage/assetBlobStore.ts` (+`listKeys`, fail-closed)
(+test), `lib/storage/garmentAssetStorage.ts` (+`archiveBlobKeys`,
+`cleanupOrphanBlobs`) (+test), `app/providers/ArchiveProvider.tsx` (live
`garmentsRef` + fire-and-forget hydration sweep) (+test), docs (`ARCHITECTURE`,
`AI_IMAGE_PIPELINE`, `QA_CHECKLIST`, `CODEX_REVIEW`, `CLAUDE.md`, `PLAN.md`).

**Tests added/updated (+14, 205 → 219):** blob store `listKeys` + clear-revokes
(2); `archiveBlobKeys` dedup/excludes remote+data URLs (1); a type-driven
**wiring-lock** fixture that fails if a new `*ImageRef` field isn't added to
`garmentBlobKeys` (1); `cleanupOrphanBlobs` — orphan deleted / referenced kept,
frozen-candidate concurrency guard, fail-closed ref-read,
delete-failure-continues, empty no-op; provider — hydration sweep reclaims a
genuine orphan + keeps referenced, ambiguous empty metadata deletes nothing, and
a metadata save failure leaves the prior persisted archive intact.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 219/219 ·
`npm run lint` ✅ · `npm run build` ✅ (no new deps).

**Browser smoke (real headless Chrome via CDP — IndexedDB path):** upload → crop →
accept cutout → archive (1 referenced blob). Injected a stray record into
`fit-archive-assets` (count → 2). **After a real reload the hydration sweep
reclaimed the stray (count → 1)** while the referenced garment still rendered from
its `blob:` URL (`loaded: true`). Delete → UI stable, blob count → 0. The Phase-11
cutout round-trip + product-reference precedence smokes still pass unchanged.

**Known limitations (intentionally deferred):** metadata + blob writes are still
**not atomic** — persistence is fire-and-forget app-wide, so a failed metadata
save is silent and its orphan blob is reclaimed at the *next* load rather than
immediately (the thumbnail prevents any broken garment in the meantime). The sweep
compares store blobs to *this tab's* loaded metadata, so in a rare **multi-tab**
session Tab B's reload could reclaim a blob Tab A just wrote but Tab B hasn't
loaded — bounded to thumbnail-degradation (never a broken garment) by the
thumbnail-always design. Full-res storage and ML/WASM segmentation remain future
work. **⚠️ Invariant for future phases:** any new `*ImageRef` blob field MUST be
added to `garmentBlobKeys`, or the sweep will treat its blobs as orphans and
delete them — a type-driven fixture test (`wiring lock`) enforces this.

**Codex review ready?** Yes — green, browser-verified, backwards-compatible,
precedence-preserving, fail-closed cleanup, no new deps or product surface.

### Phase 12.5 results — Cross-tab Orphan Sweep Safety Patch (2026-06-10)

**Verdict: PASS.** Made orphan-blob cleanup cross-tab-safe via a conservative
blob-age gate + an explicit metadata-read status, so future blob-producing work
(Phase 13) won't risk sweeping another tab's just-written crop/cutout. Storage
safety only — no product change, no deps. (Codex had already fixed the Phase 12
over-deletion blocker: candidate keys are frozen before hydrate and an empty
metadata load was skipped. Suite was 219; now 229, +10.)

**Metadata-read status behavior:** added `loadGarmentsResult(): {status:
'ok'|'unavailable', garments}` to the adapter (single-sourcing `loadGarments`).
`ok` = the read succeeded (archive may be legitimately empty); `unavailable` = the
read failed or the stored JSON is corrupt. The provider runs the sweep **only on
`ok`** — an `unavailable` read can no longer be mistaken for "no garments" and
orphan-delete still-referenced blobs. (Previously the provider used a length
heuristic that conservatively skipped on *any* empty load; the status makes the
intent explicit and lets a genuinely-empty archive still age-sweep safely.)

**Orphan age policy / cross-tab safety:** following the advisor, the creation time
is **embedded in the blob key** (`asset_<ms>_<uuid>`, `parseBlobCreatedAt`) — NOT
wrapped around the Blob record — so the hot `get`/`getObjectUrl` read path and the
DB schema are untouched (no version bump → no `onblocked` in the very multi-tab
case being hardened). `cleanupOrphanBlobs` now deletes a candidate only if it is
unreferenced **and** older than `minAgeMs` (default **1 hour**, injectable).
Recent blobs (a sibling tab's in-flight write whose garment metadata isn't visible
here yet) are kept; legacy timestamp-less keys are kept (treated as unsafe). The
memory store takes an injectable clock for deterministic tests.

**Object URL lifecycle impact:** unchanged design — the store still owns a
per-key cache revoked on delete/clear, and the sweep's `store.delete` revokes a
swept key's URL. A *kept* recent orphan is never deleted, so its (or any active)
URL is never revoked. No ref-counting (still N/A — one display URL per garment).

**Asset precedence result:** unchanged — the sweep only ever deletes
unreferenced-AND-old blobs, so product-reference-wins and accepted-cutout-wins are
untouched (re-verified by the existing precedence tests + browser smoke).

**Product-reference compatibility result:** intact — a product-reference garment's
stored-but-undisplayed cutout blob is *referenced* (via `garmentBlobKeys`) and so
is never a sweep candidate regardless of age.

**Files changed:** `lib/storage/assetBlobStore.ts` (timestamped keys +
`parseBlobCreatedAt` + memory clock arg), `lib/storage/garmentAssetStorage.ts`
(age gate in `cleanupOrphanBlobs`), `lib/storage/storageTypes.ts`
(`GarmentsReadResult` + `loadGarmentsResult`), `lib/storage/localStorageFallback.ts`
/ `indexedDbStorage.ts` / `archiveStorage.ts` (implement `loadGarmentsResult`,
single-source `loadGarments`), `app/providers/ArchiveProvider.tsx` (gate the sweep
on `status === 'ok'`), docs (`ARCHITECTURE`, `AI_IMAGE_PIPELINE`, `QA_CHECKLIST`,
`CODEX_REVIEW`, `CLAUDE.md`, `PLAN.md`).

**Tests added/updated (+10, 219 → 229):** blob-key timestamp + `parseBlobCreatedAt`
+ read-path-unchanged (3); age gate — old-swept / recent-kept / legacy-kept /
referenced-old-kept / cross-tab-ages-out (4); `loadGarmentsResult` ok-nonempty /
ok-empty / unavailable-on-corrupt (1); provider — old-orphan-swept, recent-orphan-
kept-across-reload, unavailable-metadata-skips-sweep (2). The three pre-existing
non-age sweep tests were updated to pass `minAgeMs: 0`.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 229/229 ·
`npm run lint` ✅ · `npm run build` ✅ (no new deps).

**Browser smoke (real headless Chrome via CDP — IndexedDB):** uploaded a cutout
(real timestamped key), then injected one **recent** orphan (`asset_<now>_…`) and
one **old** orphan (`asset_<now−2h>_…`). After a real reload the sweep **deleted
only the old orphan**; the recent orphan and the referenced blob were **kept**, and
the garment still rendered from its `blob:` URL (`loaded: true`). Delete → UI
stable. (The Phase 11/12 round-trip + precedence smokes still pass.)

**Remaining limitations:** this narrows the cross-tab race to "blobs younger than
the ~1 h threshold" — it is **not** transactional multi-tab coordination (no
lock / BroadcastChannel; deliberately skipped to avoid a stale-lock failure mode).
Because the sweep re-reads fresh metadata at each hydrate and only deletes
old+unreferenced blobs, the residual gap is tiny (a cross-tab write whose metadata
is still unpersisted *and* whose blob is already older than the threshold —
implausible here). Pre-12.5 legacy blobs (no embedded timestamp) are never swept.
Persistence remains fire-and-forget app-wide. Full-res storage + ML/WASM remain
future work.

**Codex review ready?** Yes — green, browser-verified, fail-closed, precedence-
and backwards-compatible, no new deps or product surface.

**Is Phase 13 now safe to begin?** Yes — the cross-tab over-sweep risk is closed:
a Phase-13 blob producer's fresh output is protected by the age gate, and any new
`*ImageRef` it adds is guarded by the wiring-lock fixture.

### Suggested next prompt (Phase 13)

> "Read PLAN.md first. Phase 12.5 (cross-tab orphan-sweep safety: blob-age gate +
> metadata-read status) is complete. Options for Phase 13: (a) higher-quality
> cutout via a dynamically-imported on-device WASM/ML segmentation model behind
> the existing `CutoutDeps` adapter, writing through the SAME blob store (lazy so
> startup never depends on it; justify the dependency); or (b) a storage
> estimate / quota UX (`navigator.storage.estimate`) + optional non-destructive
> migration of existing data-URL garments into the blob store. Keep local /
> on-device, no cloud/auth/3D. Re-use the CDP smoke harness. Keep changes small
> and verified; update PLAN.md; run typecheck/test/lint/build."

### Suggested next prompt (Phase 12) — superseded; see Phase 12 results above

### Suggested next prompt (Phase 11) — superseded; see Phase 11 results above

> "Read PLAN.md first. Phase 10 (real local background removal) is complete —
> `garmentCutout.ts` (edge flood fill behind a `CutoutDeps` adapter), the cutout
> step, and `assetMode: 'cutout'` are the seam. Options for Phase 11: (a) upgrade
> cutout quality with a dynamically-imported on-device WASM/ML segmentation model
> behind the existing `CutoutDeps` adapter (keep it optional/lazy so startup never
> depends on it; justify the dependency); or (b) full-resolution image Blobs in a
> dedicated IndexedDB object store (thumbnails stay in metadata). Keep local /
> on-device, no cloud/auth/3D. Re-use the CDP screenshot harness. Keep changes
> small and verified; update PLAN.md; run typecheck/test/lint/build."

### Phase 5 results (2026-06-08)

**Verdict: PASS.** Per the audit, the board already rendered thumbnails + restore
+ delete + persistence, so Phase 5 was **targeted card polish + the missing vibe
label + the missing tests**, not a rebuild.

**What changed:**

* **Vibe label.** Added a deterministic `vibe` to `generateFitCheck` (domain) —
  an editorial adjective from the dominant style tag (or palette tone when there
  are no tags) plus a completeness noun, e.g. "Minimal silhouette", "Street
  look", "Neutral layer". `dominantTags`' existing alphabetical tie-break makes
  it stable. **Not AI** — pure, deterministic, unit-tested.
* **`SavedOutfitCard` upgraded** — now shows the **vibe** (accent eyebrow) and a
  **category-labels** line ("Top · Pants") alongside the existing thumbnails /
  cover hue / name / date, and the restore CTA reads **"Restore fit"**.
  Consolidated to three text lines to stay editorial, not cluttered. A **stale
  look** (garments since deleted) renders gracefully — the vibe + category line
  hide rather than showing the degenerate "Unstyled".
* **Board empty state** sharpened to "Your look board is waiting" + an editorial
  invitation, keeping the "Open the Mirror" action.
* **No backend / AI / 3D / domain migration** — the vibe is derived at render
  from the resolved garments; `SavedOutfit` is unchanged.

**Files changed:**

* `src/domain/fitCheck.ts` — `vibe` field + `deriveVibe` / `VIBE_WORD` /
  `toneWord`.
* `src/domain/fitCheck.test.ts` — +4 vibe tests (empty / dominant-tag /
  **alphabetical tie-break** / completeness noun).
* `src/components/outfit/SavedOutfitCard.tsx` — vibe + category labels +
  "Restore fit" + graceful stale-look rendering.
* `src/components/outfit/SavedOutfitCard.test.tsx` *(new, 3 tests)* — thumbnails
  + category labels + vibe; restore/delete callbacks; stale-look graceful render.
* `src/components/studio/OutfitWallBoard.tsx` — sharper empty-state copy.
* `src/components/studio/OutfitWallBoard.test.tsx` *(new, 1 test)* — empty state.
* `src/app/providers/ArchiveProvider.test.tsx` — +1 **provider-level** test:
  deleting a look keeps every garment (the real data-loss guard).
* `src/app/providers/archiveReducer.test.ts` — +1 reducer test: `REMOVE_OUTFIT`
  leaves garments untouched.
* `src/styles/archive-theme.css` — `.savedcard__vibe` style.
* `docs/ARCHITECTURE.md`, `docs/QA_CHECKLIST.md` — saved-card responsibility +
  Phase 5 manual checks.

**Verification (all green):** `npm run typecheck` ✅ · `npm test` ✅ 109/109 (was
99; +10) · `npm run lint` ✅ · `npm run build` ✅ (JS 204.5→205.4 kB).

**Known limitations / deferred:**

* **Visual-unverified (standing caveat), aesthetic-only.** The card adds two text
  lines inside an existing grid cell — no width/clip failure mode — so the
  `~1280px` eyeball confirms only that the card reads **editorial vs cluttered**
  (vibe + name + cats/date + thumbnail strip + actions). Green ≠ "not cluttered".
* Restore → preview update is covered **transitively** (provider `restoreOutfit`
  test + the Phase 4 mannequin/mirror "reads `currentOutfit`" tests), not by one
  end-to-end board→mannequin test.
* Deleting a garment still leaves a gap in any saved look that referenced it
  (existing behaviour — saved looks aren't sanitized on garment delete, only
  `currentOutfit` is). The card now renders that hollow state gracefully; auto-
  pruning stale references from saved looks is **deferred** (out of Phase 5
  scope).

**Codex review ready?** Yes — with the standing visual caveat (one `npm run dev`
walk: save → board card → restore → mannequin/mirror/inspector update → delete →
garments remain → reload). Vibe determinism, card render, delete-keeps-garments,
and persistence are covered by the suite.

### Suggested next prompt (Phase 6)

> "Read PLAN.md first. Phase 5 (saved-outfit board) is complete; optionally
> eyeball the Outfits board with `npm run dev` first. Now do Phase 6 only —
> Architecture & Documentation Hardening: make CLAUDE.md and docs/ (ARCHITECTURE,
> ROADMAP, AI_IMAGE_PIPELINE, QA_CHECKLIST) accurate to the current build, ensure
> no misleading AI/3D claims, English-only comments, and add the future
> extension notes. Mostly a docs/accuracy pass — audit the code-vs-docs delta
> first. Keep code changes minimal, update PLAN.md, run typecheck/test/lint/build,
> and document honestly."

## Implementation Phases

### Phase 0 — Audit Current State

Goal:
Understand the current implementation without rewriting it.

Tasks:

* Inspect current file structure
* Identify existing components
* Identify current storage approach
* Identify upload flow status
* Identify outfit selection status
* Identify saved outfit status
* Identify test/build scripts
* Identify visual direction gaps
* Do not implement new features yet unless required to make the app run

Verification:

* npm install if needed
* npm run typecheck if available
* npm test if available
* npm run lint if available
* npm run build if available

Deliverable:

* Update PLAN.md with “Current State Notes”
* List blockers and warnings

Status:

* [ ] Not started
* [ ] In progress
* [x] Complete — see “Current State Notes” above

---

### Phase 1 — Stabilize Core Data Flow

Goal:
Make the basic product flow reliable before improving visuals.

Tasks:

* Ensure garment domain types exist
* Ensure outfit domain types exist
* Ensure saved outfit domain types exist
* Ensure upload creates a garment item
* Ensure garment items persist across reloads
* Ensure garment items can be edited
* Ensure garment items can be deleted
* Ensure current outfit selection works by category
* Ensure selecting a new item replaces the previous item in that category
* Ensure selected outfit can be cleared
* Ensure saved outfits persist across reloads
* Ensure saved outfits can be restored
* Ensure saved outfits can be deleted

Expected user flow:

1. Upload item
2. Confirm metadata
3. See item in closet/filmstrip
4. Select item for outfit
5. See outfit inspector update
6. Save outfit
7. Reload page
8. Garments and outfits still exist
9. Restore saved outfit

Tests:

* storage adapter saves and loads garments
* storage adapter saves and loads outfits
* outfit selection replaces by category
* fit check generation handles empty and filled outfits
* mock garment analysis returns valid shape

Verification:

* npm run typecheck
* npm test
* npm run build

Status:

* [ ] Not started
* [ ] In progress
* [x] Complete — verification pass; see “Phase 1 results” under Current State Notes

---

### Phase 2 — Make Clothes Visually Central

Goal:
Fix the main issue where the room looks cool but clothes are not the hero.

Tasks:

* Add or improve bottom garment filmstrip
* Add or improve closet panel
* Add or improve right-side current outfit inspector
* Make uploaded item thumbnails larger and more important
* Show selected state clearly
* Show category/color/tags on cards
* Improve empty states
* Ensure room rack uses uploaded item thumbnails where possible
* Reduce decorative UI that distracts from clothes

Layout target:

* Left: minimal navigation
* Center: archive studio scene
* Right: current outfit inspector
* Bottom: garment filmstrip

Verification:

* Upload item appears in bottom filmstrip
* Upload item appears in closet
* Selecting item updates inspector
* Current outfit is visible without opening multiple modals
* Room still feels premium

Status:

* [ ] Not started
* [ ] In progress
* [x] Complete — audit + targeted polish; see “Phase 2 results” under Current State Notes

---

### Phase 3 — Upload To Archive Transition

Goal:
Make the upload moment feel like the product’s signature interaction.

Tasks:

* Add upload scanning state
* Add mock AI guess card with confidence
* Add confirm/edit step before saving
* Add “Archive Piece created” state
* Animate confirmed item into archive room / rack / filmstrip
* Add small archive metadata label
* Ensure user can skip or edit AI guess
* Keep transition lightweight and maintainable

Important:
This is a visual/UX illusion. Do not claim real AI recognition exists.

Expected flow:

1. User uploads photo
2. Preview appears
3. Scanning overlay animates
4. Mock AI guess appears
5. User edits/confirms metadata
6. Card becomes Archive Piece
7. Card transitions into room/filmstrip
8. Item persists

Verification:

* Transition does not block saving
* Works with repeated uploads
* Works on reload
* No broken state if user cancels

Status:

* [ ] Not started
* [ ] In progress
* [x] Complete — PASS WITH WARNINGS (visual-unverified); see “Phase 3 results”

---

### Phase 4 — Mannequin and Mirror Preview Upgrade

Goal:
Make outfit preview more convincing without real 3D try-on.

Tasks:

* Replace any toy-like avatar with tall faceless mannequin
* Add body zones:

  * outerwear/top torso zone
  * pants leg zone
  * shoes foot zone
  * accessory upper-body zone
* Render selected garment images as layered panels or overlays
* Add mirror preview summary
* Add current fit label
* Add generated Fit Check summary
* Ensure empty state looks intentional

Important:
This is a stylized 2.5D outfit preview, not real cloth simulation.

Verification:

* Selecting top affects torso zone
* Selecting pants affects leg zone
* Selecting shoes affects foot zone
* Clearing items removes visual layer
* Saved outfit restore updates mannequin

Status:

* [ ] Not started
* [ ] In progress
* [x] Complete — PASS; see “Phase 4 results” under Current State Notes

---

### Phase 5 — Saved Outfit Board Polish

Goal:
Make saved outfits feel like an archive wall, not a plain list.

Tasks:

* Display saved outfits as editorial look cards
* Show mini item thumbnails in saved look cards
* Add vibe label
* Add created date
* Add restore action
* Add delete action
* Show saved looks on wall board or outfits panel
* Clicking a saved look restores it to the mannequin

Verification:

* Save current outfit
* Saved card appears
* Restore saved outfit
* Delete saved outfit
* Reload persistence works

Status:

* [ ] Not started
* [ ] In progress
* [x] Complete — PASS; see “Phase 5 results” under Current State Notes

---

### Phase 6 — Architecture and Documentation Hardening

Goal:
Prepare the project for future AI/3D integration.

Tasks:

* Ensure CLAUDE.md is accurate
* Ensure docs/ARCHITECTURE.md is accurate
* Ensure docs/AI_IMAGE_PIPELINE.md is accurate
* Ensure docs/ROADMAP.md is accurate
* Ensure docs/QA_CHECKLIST.md is accurate
* Ensure docs/CODEX_REVIEW.md exists
* Ensure code comments are in English
* Ensure no misleading AI/3D claims
* Add future extension notes for:

  * real Vision API
  * background removal
  * product recognition
  * React Three Fiber scene
  * GLB mannequin
  * 3D try-on research

Verification:

* Docs match implementation
* No fake claims
* Codex review prompt exists

Status:

* [ ] Not started
* [ ] In progress
* [x] Complete — PASS; see “Phase 6 results” under Current State Notes

---

### Phase 7 — Codex Review Preparation

Goal:
Prepare clean handoff for Codex review.

Tasks:

* Create or update docs/CODEX_REVIEW.md
* Include commands to run
* Include expected MVP behavior
* Include non-goals
* Include known limitations
* Include risk areas
* Include PASS / PASS WITH WARNINGS / BLOCK criteria
* Include exact Codex review prompt

Verification:

* docs/CODEX_REVIEW.md exists
* Review prompt is copy-paste ready
* All verification commands were run or documented

Status:

* [ ] Not started
* [ ] In progress
* [ ] Complete

## Execution Rules For Claude

1. Always read PLAN.md before implementing.
2. Implement only the next incomplete phase unless the user explicitly asks otherwise.
3. Do not rewrite the whole app unless the current architecture is unsalvageable.
4. Keep changes small and verifiable.
5. After each phase:

   * update PLAN.md status
   * summarize files changed
   * run verification commands
   * document failures honestly
   * create a suggested next prompt
6. Do not add backend/auth.
7. Do not add real AI calls yet.
8. Do not add real 3D cloth simulation.
9. Do not introduce heavy dependencies without explaining why.
10. Preserve premium dark fashion archive direction.

## Commands To Prefer

Run these when available:

* npm run typecheck
* npm test
* npm run lint
* npm run build

If a command does not exist:

* document that it does not exist
* add it only if appropriate for the project setup

## Codex Review Handoff Notes

Codex will be used as the external reviewer after implementation.

Codex should check:

* broken flows
* TypeScript errors
* test failures
* build failures
* persistence bugs
* upload bugs
* outfit selection bugs
* saved outfit restore bugs
* misleading AI/3D claims
* visual direction mismatches
* overengineering
* poor component boundaries
* missing tests

## Known Limitations

Current app is expected to be an MVP illusion, not a production virtual try-on system.

Known limitations:

* AI classification is mock only
* product recognition is not real
* background removal is a real but **local, experimental** edge flood fill
  (Phase 10) — opt-in, quality varies, not ML/cloud; higher-quality ML
  segmentation is future work
* mannequin preview is 2.5D/stylized
* uploaded images are locally stored
* no cloud sync
* no authentication
* no real garment physics

## Next Prompt Template

Use this in the next Claude CLI session:

“Read PLAN.md first. Continue from the next incomplete phase only. Do not start later phases until the current phase is complete and verified. Keep changes small, update PLAN.md, run typecheck/test/build, and summarize blockers honestly.”

After creating PLAN.md:

1. Run Phase 0 audit.
2. Update the “Current State Notes” section in PLAN.md.
3. If the app is broken or cannot build, fix only minimal blockers needed to start Phase 1.
4. Do not jump into visual polish before Phase 1 core data flow is stable.
