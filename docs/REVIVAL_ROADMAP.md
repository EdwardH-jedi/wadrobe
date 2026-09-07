# Revival Roadmap — Wardrobe Core v1

Created: 2026-09-07 · Branch: `revival/core-v1` · Baseline commit: `b9f4b22`

This is the **authoritative direction document** for the revival pass. It says
what Wardrobe is being built toward and in what order.

It is deliberately **not** a status document. What exists today lives in
[`PROJECT_STATUS.md`](PROJECT_STATUS.md), which stays the source of truth for
implementation state; this file is the source of truth for *direction*. Where
they overlap, this file links rather than restates.

Deferred ideas go to [`REVIVAL_BACKLOG.md`](REVIVAL_BACKLOG.md).

---

## 1. Product definition (binding)

> Wardrobe is a personal digital wardrobe where users archive clothes they own,
> enrich them with metadata, browse their closet, build outfits, preview
> combinations in a polished 2.5D styling view, and save looks.

The core loop:

```text
photo
→ prepare image
→ confirm garment information
→ archive
→ browse closet
→ select pieces
→ 2.5D outfit preview
→ save outfit
```

Two properties bind every decision below:

1. **Mobile-first.** Wardrobe must feel like a useful wardrobe application on a
   phone before it feels like a technical demo.
2. **Valuable with nothing configured.** The product must be fully worthwhile
   even if the entire 3D backend, the vision provider, and the product-lookup
   layer are unavailable. They are extras, never load-bearing.

---

## 2. Core vs Experimental

| | Scope | Position |
| --- | --- | --- |
| **Core** | Closet · garment upload · garment metadata · image preparation · outfit selection · 2.5D outfit preview · saved outfits · local persistence · mobile UX | The product. Primary navigation. |
| **Secondary** | Studio (the editorial showroom room) | Kept for its portfolio value, demoted from defining the app. |
| **Experimental** | Proxy 3D Lab · PNG → extruded GLB · avatar composition · bbox-based 3D fitting · template garment 3D | Preserved, isolated, reachable only behind `VITE_ENABLE_EXPERIMENTAL_3D`. |

**Experimental 3D is explicitly NOT part of Core v1 completion.** It is not a
release blocker, it does not appear in a default build, and it must never
visually compete with the Closet and Outfit workflows. It is also not deleted:
the code is genuinely interesting and cheap to keep isolated.

---

## 3. Phase direction

### Phase 0 — Stabilize · *this pass*
Establish one trustworthy green baseline across all six gates before any
product change. No new features. Land inherited work honestly, write down the
real test state, and correct documentation that had drifted.

### Phase 1 — Mobile Wardrobe Core · *this pass*
Make the Closet the product's centre of gravity. Reorder navigation around
Closet / Outfits / Lookbook / Fit Preview, demote Studio and Experimental 3D,
land a real mobile bottom navigation, and land the responsive work the phone
layout needs.

### Phase 2 — Image preparation + 2.5D fitting quality · *this pass*
Fix the largest visual weakness: garments read as *pasted onto* the mannequin
rather than fitted into body zones. Introduce real content-bounds analysis of
transparent cutouts, persist the bounds, and drive one deterministic geometry
model from them. Still 2.5D — no try-on claim, no simulation.

### Phase 3 — Metadata and organisation depth · *not started*
Accessory taxonomy expansion, richer filtering, collections/seasons. Waiting on
Phase 1–2 landing so it builds on the mobile IA rather than the old one.

### Phase 4 — Image quality upgrade · *not started*
A higher-quality segmentation step behind the cutout provider seam introduced
in Phase 2, with the local flood fill as the permanent fallback. Explicitly
gated on the seam existing first.

### Phase 5 — Experimental 3D reconsidered · *not started*
Only after Core v1 is genuinely finished. Whether the proxy-3D track earns
promotion, stays frozen, or is retired is a decision for that point, not this
one.

**Phases 3–5 are direction, not commitments.** This pass stops at the end of
Phase 2.

---

## 4. Baseline: actual state at the start of this pass

Measured on 2026-09-07 against `b9f4b22` (Node 26.7.0, npm 11.19.0), not taken
from any historical report.

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | **green** |
| Lint | `npm run lint` | **green** |
| Frontend tests | `npm test` | **green** — 597 passed, 73 files |
| Frontend build | `npm run build` | **green** |
| E2E | `npx playwright test` | **green** — 16 passed (chromium + mobile) |
| Backend | `backend/.venv/bin/python -m pytest backend` | **green** — 75 passed |

### On the "known failing tests" in historical notes

The task brief anticipated frontend failures from jsdom canvas limits, WebGL, or
`GlbViewer` mounting. **There were none.** The suite was already green, and the
architecture is why:

- `GlbViewer` has no unit test mounting a real WebGL context. Three.js is
  reached **only** through a dynamic `import()` inside that viewer, so no test
  that does not explicitly enter the lab ever loads it.
- The canvas-dependent image path is deliberately kept out of unit tests. Where
  decode behaviour must be checked, it is checked through a stubbed `Image` and
  an injectable `CutoutDeps` adapter rather than a real canvas.

So no test seam, mock, or stub needed to be added, and nothing was skipped. The
historical notes were **stale, not wrong at the time** — the seams that made the
failures go away were added in earlier phases and the notes were never updated.
This is recorded here so a future reader does not go looking for a problem that
has already been designed out.

### On Node version

The brief suggested pinning Node 20. **Verified and deliberately not done** —
every signal in the repository contradicts it:

- `.nvmrc` → `24`
- `package.json` `engines.node` → `>=22`
- `@types/node` → `^22.10.5`
- CI (`.github/workflows/ci.yml`) runs the web job on Node 24 LTS
- `jsdom ^25` and `vite ^6` both require ≥20 but are exercised on 22+ here

The project already carries an explicit version signal, and it says 22-or-newer
with 24 as the pinned development version. Downgrading the signal to 20 would
make it *less* accurate, so the existing signal stands unchanged.

### On root file hygiene

`IMG_0198.jpg` does not exist anywhere in the working tree or the index. Nothing
to move or remove.

---

## 5. Known technical debt carried into this pass

Full detail in [`PROJECT_STATUS.md` §10](PROJECT_STATUS.md). The items that
bear on Phase 0–2 specifically:

- **Nothing is pushed.** The local branch is far ahead of `origin/main`. This is
  a distribution problem, not a code problem, and it is the user's call.
- **`archive-theme.css` is one large file** (~3.1k lines). A split is tempting
  and deliberately deferred — see the backlog.
- **`three.module` is a 733 kB chunk** in the build output. It is dynamically
  imported so a default visitor never downloads it, but the build warning is
  noise that will keep being re-noticed.
- **The 2.5D geometry has two owners** — semantic layer presets in
  `domain/garmentLayout.ts` and pixel percentages in `archive-theme.css`. Phase
  2 addresses exactly this.

---

## 6. Rules that outlive this pass

- The drafted classification is **never binding**; the user confirms, and a name
  is required.
- Honest copy only. No "AI cutout", "automatic background removal", "real
  try-on", "accurate fit", or "true sizing". The `FORBIDDEN_CLAIM_TERMS` test
  enforces this and must stay enforced.
- Layering stays `domain → lib → app/providers → components`.
- New optional garment metadata is **additive and parser-tolerant**; legacy
  records must stay valid forever.
- Metadata-only fields own no blob bytes and therefore never enter
  `garmentBlobKeys`.
