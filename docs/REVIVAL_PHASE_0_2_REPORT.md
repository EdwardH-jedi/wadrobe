# Wardrobe Revival Phase 0–2 Report

Date: 2026-09-07 · Branch: `revival/core-v1`

Direction lives in [`REVIVAL_ROADMAP.md`](REVIVAL_ROADMAP.md); status lives in
[`PROJECT_STATUS.md`](PROJECT_STATUS.md). This is the account of one pass.

---

## Baseline

| | |
| --- | --- |
| Branch | `revival/core-v1`, cut from `main` |
| Starting commit | `8ac6d19` ("Merge career-ready rehabilitation") |
| Working tree | **Dirty** — 30 modified files, 5 untracked, from a prior session |
| Node / npm | 26.7.0 / 11.19.0 |

The working tree held a substantial, unfinished-looking hardening pass:
per-slice persistence acknowledgement, an alert banner, an SSRF guard for the
optional API layer, responsive CSS repairs, and a documentation correction
sweep. It was inspected rather than reset, found coherent and complete, and
landed as its own commit (`b9f4b22`) before any revival work began — so the
revival commits stay honest about what they did and did not change.

**Starting test state: everything already green.** 597 unit tests, 16
Playwright tests, 75 backend tests, plus typecheck, lint and build.

---

## Phase 0 — Stabilize

The brief anticipated three problems. None of them existed, and establishing
that was most of the phase's value.

**No failing frontend tests.** The jsdom/WebGL/`GlbViewer` failures in the
historical notes had already been designed out: three.js is reached only
through a dynamic `import()` inside the GLB viewer, so no test that does not
explicitly enter the lab ever loads it, and the canvas path is exercised through
injectable adapters and a stubbed `Image` rather than a real canvas. **No test
seam, mock or stub was added, and nothing was skipped.** The notes were stale,
not wrong when written.

**No Node downgrade.** Every signal in the repository contradicted pinning
Node 20 — `.nvmrc` says 24, `engines` says `>=22`, `@types/node` is `^22`, CI
runs Node 24, and the README records that the suite needs a flag Node 20
rejects. Verified, then deliberately left alone: changing the signal to 20 would
have made it less accurate.

**No `IMG_0198.jpg`.** It does not exist in the tree or the index.

One gate the brief did not list was missing from the baseline and was added:
**Playwright e2e**, which the prior session's notes suggested might be red. It
was green (16 tests), and it became the regression net for Phase 1's layout work.

### Delivered
- `docs/REVIVAL_ROADMAP.md` — the authoritative direction document: Core v1
  definition, the core/experimental split, Phase 0–5 direction, the measured
  baseline, and the reasoning above recorded so nobody re-investigates it.
- `docs/REVIVAL_BACKLOG.md` — deferred ideas, each with why.
- README: corrected "Planned Direction", which still listed archive
  export/import and an end-to-end test suite as future work after both shipped.
- PROJECT_STATUS cross-linked to both, with the status/direction boundary stated.

Commits: `b9f4b22` (inherited work), `22b6f5d` (baseline).

---

## Phase 1 — Mobile Wardrobe Core

The wardrobe was reachable on a phone but did not behave like a wardrobe
application on one.

### Navigation
- `DEFAULT_VIEW` is now the **Closet**, not the Studio. A single global default,
  not a width-dependent one: reading the window during render is fragile, and
  the Closet is the right landing view on a desktop too.
- `VIEW_ORDER` leads with the wardrobe — Closet, Outfits, Lookbook, Fit
  Preview — then Studio, then the lab.
- The mirror is labelled **"Fit Preview"** (what it does, not the furniture);
  the lab is **"Experimental 3D"** — "Proxy 3D" read like a shipped feature. The
  lab stays behind `VITE_ENABLE_EXPERIMENTAL_3D`; **no new flag was added**, as
  the existing one already did the job.

### Mobile UX
- New `src/components/navigation/MobileBottomNav.tsx`: Closet, Outfits, a
  prominent **Add**, Lookbook, and a **More** popover (Escape and outside-tap
  close it) holding Fit Preview, Studio, and the lab when enabled.
- More's contents are **derived** from the view order, not hand-listed, so a
  view added later cannot become unreachable on a phone. A test asserts the
  partition is exact.
- Which navigation shows is decided by **CSS at the existing 860px
  breakpoint**. Both are always mounted, so nothing re-mounts on a resize and
  there is no window-size state to go stale. The old 68px icon-rail treatment is
  gone — it cost a sixth of a 390px screen and put the primary actions in the
  least reachable corner.
- Only ever one bottom bar: the filmstrip is hidden on a phone. Verified first
  that this does not break outfit selection — `GarmentCard` already carries a
  Style action.
- Closet grid is **two columns** on a phone (a 358px card meant one garment per
  screen; it is now ~173px). The tag cloud wrapped to five rows and buried the
  grid below the fold — now one scrollable row. The topbar Upload is hidden on
  mobile, where Add is both always visible and more reachable.

### Files changed
`views.ts`, `ArchiveStudio.tsx`, `SidebarNav.tsx`, `Icon.tsx`,
`navigation/MobileBottomNav.tsx` (new), `archive-theme.css`, and five test
files.

### Manual QA
Driven in a real headless browser at **390 / 430 / 768 / 1024 / 1440**:

| Width | Sidebar | Mobile bar | Filmstrip | Card width | Overflow-X | Min touch target |
| --- | --- | --- | --- | --- | --- | --- |
| 390 | hidden | shown | hidden | 173px | 0 | 49px |
| 430 | hidden | shown | hidden | 193px | 0 | 49px |
| 768 | hidden | shown | hidden | 348px | 0 | 49px |
| 1024 | shown | hidden | shown | 353px | 0 | 44px |
| 1440 | shown | hidden | shown | 272px | 0 | 44px |

Exactly one navigation at every width; no horizontal overflow at either the
document or the scroll-container level.

Commit: `261ea06`.

---

## Phase 2 — Image preparation + 2.5D fitting quality

### What was actually wrong

A units problem, not a styling one. A cutout is mostly transparent canvas with a
garment somewhere inside it, and the renderer fitted the **canvas** into a body
zone — so what landed on the figure was the emptiness, not the clothes. Shoes
showed it worst: a shoe occupying 15% of its frame's height, dropped into a
40%×12% zone with `object-fit: contain`, came out as a sliver above the ankles.

### Content-bounds implementation
`src/lib/image/contentBounds.ts` — pure alpha math over an RGBA buffer, no
canvas, tested against hand-built arrays. It measures **alpha only** and returns
`null` rather than a guess for a transparent frame, a malformed buffer, a
non-integer dimension, or a subject too small to be real. The alpha threshold is
8, not 0, because WebP is lossy and a strict `> 0` test would measure the
compression noise instead of the garment.

It runs **inside `attemptGarmentCutout`**, on the raster already in hand, after
the flood fill and before encoding — no extra decode, and the bounds describe
the image actually being stored. A test asserts `rasterize` is still called once.

### Layout strategy
`domain/garmentLayout.ts` became the single owner of the geometry. The `.zone-*`
percentages moved out of CSS verbatim (`ZONE_BOXES`), so the change of owner did
not also change the layout, and `fitCutoutLayer` was added:

- Scale the whole image so its **content** reaches the category's target width.
- Convert width-fractions to height-fractions through the stage aspect
  (`MANNEQUIN_ASPECT`), which the persisted `sourceAspect` makes possible.
- Cap by height, scaling **uniformly** — the smaller constraint wins, so a
  garment always keeps its proportions. Nothing is ever stretched.
- Shift so the content's centre lands on the anchor.

Pure and deterministic; returns `null` for degenerate bounds rather than
rendering at `NaN%`.

### Category presets

| Category | Anchor (x, y) | Target width | Max height |
| --- | --- | --- | --- |
| outerwear | 0.50, 0.37 | 0.62 | 0.40 |
| top | 0.50, 0.35 | 0.46 | 0.28 |
| pants | 0.50, 0.66 | 0.40 | 0.36 |
| shoes | 0.50, 0.888 | 0.36 | 0.11 |
| accessory | 0.50, 0.10 | 0.24 | 0.13 |

Anchors were chosen against the figure's own silhouette (head 17–99, torso
118–312, legs 312–478, feet ~488–512 in its 320×570 viewBox).

### Backwards compatibility
Three presentations, and a garment gets the one its image can honestly support:
a cutout **with** bounds is fitted; a cutout **without** them and every opaque
or legacy photo keep the matted panel and its multiply blend. Nothing needs
migrating. `getGarmentDisplayImage` precedence is untouched, and the fitted path
is gated on `assetMode === 'cutout'`, so a product reference is never shadowed.

### Visual QA
Run in a real browser. The comparison table below used transparent PNGs injected
directly, to isolate the rendering; the **whole shipped pipeline** was then run
end to end separately (below), which is what makes the claim real.

| Case | Before | After |
| --- | --- | --- |
| C — Shoes | A thin sliver, unreadable as footwear | Wide, sitting on the feet |
| B — Pants | Floating, narrow, stopping short of the ankles | Waist to ankle at a sensible width |
| A/D — Coat + top | Small inside its box; coat behind the shirt | Coat spans the shoulders and layers over the shirt |
| E — Legacy opaque | Matted panel | Matted panel, unchanged |

**End-to-end, through the shipped code, at 390px.** A real white-background PNG
was uploaded through the actual file input and driven scan → crop → *Use
cutout* → name → archive, exercising `attemptGarmentCutout` on a real Chromium
canvas. The stored record came back
`assetMode: 'cutout'`, `contentBounds: { x: 0.122, y: 0.542, width: 0.763,
height: 0.150, sourceAspect: 1 }` — measured by the shipped
`computeContentBounds`, not by the QA script. The piece was then styled from its
closet card, reached via **More → Fit Preview** (one fitted layer), saved as a
look, found on the Outfits board, and both survived a reload. That is steps
1–13 of the Phase 1 acceptance flow, on a phone viewport, with no backend.

**Containment.** A deliberately wide coat cutout was checked inside the Studio
alcove and the small mirror: it sits 98px and 27px *inside* those containers
respectively, with zero document overflow. Fitted layers can be drawn wider than
the stage, so this was worth proving rather than assuming.

### One defect found and fixed
Reviewing the blob-hydration path turned up a case the new code got wrong: a
blob-backed cutout whose blob has gone missing degrades to the opaque
`imageDataUrl` thumbnail, but kept `assetMode: 'cutout'` **and** its bounds — so
the mannequin would have scaled an opaque thumbnail by a transparent image's
measurements, into a misplaced rectangle across the figure. Worse than what it
replaced, and only in the already-degraded case.

Fixed at the source: `hydrateGarmentForRuntime` drops the bounds whenever what
it resolved is not the cutout. Commit `d64eadd`.

### Deliberate behaviour changes
- A fitted cutout drops the panel's **name tag and colour accent bar**. Those
  belong to the matte panel — a floating silhouette has no edge to hang them on.
  The name is still on the card, the Lookbook, and the outfit inspector.
- Empty-slot placeholders now sit beneath every garment layer. They previously
  inherited a z-index from the `.zone-*` rules, so an empty torso placeholder
  could sit above an outerwear panel. Garments over placeholders is the better
  order, and it is now explicit rather than incidental.

### Remaining weaknesses
- Bounds exist only for cutouts accepted **after** this change. Earlier ones
  fall back to the panel; re-accepting a cutout produces them.
- The flood fill still only works on clean flat-lay backgrounds. The provider
  chain (`lib/image/cutoutProvider.ts`) writes down where a better segmenter
  would slot in, but holds exactly one provider today, so behaviour is unchanged
  by construction.
- Opaque photos get no fitting at all, by design.
- The presets are eyeball-tuned against synthetic garment shapes. Real
  photographs of real clothes will justify another tuning pass.

Commits: `46545fa`, `d64eadd`.

---

## Preserved

Intentionally retained, unchanged in substance:

- The `domain → lib → app/providers → components` layering. (`NormalizedContentBounds`
  was placed in `domain/` specifically so `garmentLayout` would not have to
  import upward from `lib/`.)
- The pure `archiveReducer` and the provider that keeps `Date.now()`/`crypto`
  out of it.
- The three-tier IndexedDB → localStorage → in-memory persistence facade, the
  separate asset blob store, the revision-based multi-tab guard, and the
  fail-closed orphan sweep.
- `uploadFlow.ts`'s pure state machine — extended by one optional action field,
  not restructured.
- `getGarmentDisplayImage` and its precedence ordering.
- The analyzer seams (`createAnalyzer`, `visionAnalysis`, `mockGarmentAnalysis`)
  and the rule that the guess is never binding.
- The optional product-lookup seams; no network path became mandatory.
- `garmentCutout.ts`'s flood fill and its `CutoutDeps` seam.
- `GlbViewer.tsx` and the whole Proxy 3D lab.
- `StudioScene` — demoted in the navigation, untouched as a component.
- The `FORBIDDEN_CLAIM_TERMS` honesty tests. No user-facing copy was added in
  Phase 2, and the preview is still described only as 2.5D.

---

## Frozen / Experimental

Unchanged by this pass, and still not on the product path:

| | Status |
| --- | --- |
| Proxy 3D Lab | Working, hidden unless `VITE_ENABLE_EXPERIMENTAL_3D`; needs the local FastAPI service. Relabelled "Experimental 3D" and moved last in the navigation. |
| Extruded silhouette generator | Working within the lab; produces a proxy, not a reconstruction. |
| Bbox outfit fitter | Backend only, covered by pytest, **no frontend consumes it**. |
| Avatar pipeline (`/api/jobs`) | Backend only; body estimation and texture projection are deterministic stubs that record honestly what they did not do. |

None was deleted. The isolation is positional and flag-based, not surgical.

---

## Deferred

Full list with reasoning in [`REVIVAL_BACKLOG.md`](REVIVAL_BACKLOG.md). The
notable ones:

- **Manual preview transform** (user-adjustable garment placement) — auto-fit
  first. Shipping an escape hatch before the automatic placement is good would
  be building around the problem instead of fixing it.
- Splitting `archive-theme.css` (~3.1k lines) — maximum churn, zero user-visible
  gain, and the wrong moment (right before/during a responsive pass).
- A real router — no deep links or back-button support today; most noticeable on
  a phone.
- Higher-quality segmentation behind the new provider seam — a Phase 4 question
  about dependency weight.
- Backfilling bounds for previously-accepted cutouts.
- The storage badge is desktop-only, so a phone gets durability news only when
  something is wrong. Arguably correct; deserves a deliberate decision.

---

## Current gate matrix

All run at commit `6c2e2aa` on Node 26.7.0.

| Gate | Command | Result |
| --- | --- | --- |
| typecheck | `npm run typecheck` | **PASS** |
| lint | `npm run lint` | **PASS** |
| frontend tests | `npm test` | **PASS** — 707 tests, 78 files |
| frontend build | `npm run build` | **PASS** |
| e2e | `npx playwright test` | **PASS** — 20 tests (Chromium + Pixel 7) |
| backend pytest | `backend/.venv/bin/python -m pytest backend` | **PASS** — 75 tests |

Test count moved 597 → 707 (+110). No test was skipped, weakened, or deleted to
reach green. Eleven Phase 1 tests and five Phase 2 tests encoded assumptions the
work invalidated (the old landing view, the old lab label, `.zone-*` CSS class
names); each was rewritten to assert the same behaviour under the new design —
and in the mannequin's case, to assert the geometry itself rather than a class
name, which is stronger than what it replaced.

### Codex review — not performed

The brief and `CLAUDE.md` §10 both call for Codex as an external reviewer. **It
could not run.** The installed CLI (0.148.0) is too old for the account's
default model, and every alternative model is rejected for a ChatGPT-account
Codex session:

```
The 'gpt-6-astra' model requires a newer version of Codex.
The 'gpt-5-codex' model is not supported when using Codex with a ChatGPT account.
```

This is an environment/auth problem, not a finding. In its place the highest-risk
areas a review would have targeted were checked directly — the content-bounds
maths, the fitting arithmetic, the blob hydrate/dehydrate lifecycle, the import
path, asset precedence, and whether the rewritten tests were weakened. That
check is what found the two stale-bounds defects — the one fixed in `d64eadd`
and a second, wider one: `hydrateGarmentForRuntime` only owns the blob path, and
the import path can produce the same shape (a dropped foreign blob ref with the
bounds still attached). That is fixed with a sink-side guard in the renderer, so
the invariant now holds however the garment arrived. **A Codex pass is still
owed** once the CLI is upgraded (`npm i -g @openai/codex`).

---

## Core v1 status

### READY WITH WARNINGS

The core loop — photo → prepare → confirm → archive → browse → select → 2.5D
preview → save — is complete, works with nothing configured, is usable on a
phone, and is covered end to end by unit and real-browser tests. Every gate is
green. No part of it depends on the 3D backend, the vision provider, or the
product-lookup layer.

The warnings, in order:

1. **Nothing is pushed.** The branch is many commits ahead of `origin/main`.
   Publishing is the user's decision, so this pass did not make it.
2. **Never deployed, no users.** Every quality claim here rests on tests and
   local browser QA, not on anyone having used it.
3. **The fitting presets are tuned against synthetic shapes.** They are a large
   improvement on what they replaced and verified as such, but real photographs
   of real clothes will justify another pass.
4. **Cutout quality still gates the good presentation.** A busy background means
   no cutout, no bounds, and the honest matted panel — correct behaviour, but it
   means the best version of the preview is not what every photo gets.
5. **A Codex review is owed**, per above.

None of these blocks calling the core product finished. All of them should be
read before calling it shipped.

### Recommended next phase

**Not** more features. In order: push the branch; then run the owed Codex review;
then use the app on real photographs of real clothes for a week and re-tune the
five presets from what that shows. Phase 3 (metadata depth) and Phase 4 (better
segmentation) both build on the fitting being right, and right is currently
asserted against shapes drawn by a script rather than clothes owned by a person.
