# The Archive

**A local-first web app for cataloguing the clothes you own — photograph a
piece, confirm a drafted classification, and browse, filter and style your
wardrobe on a layered mannequin. No account, no server, no data leaving the
browser.**

[![CI](https://github.com/EdwardH-jedi/wadrobe/actions/workflows/ci.yml/badge.svg)](https://github.com/EdwardH-jedi/wadrobe/actions/workflows/ci.yml)

> Repository note: the repo is named `wadrobe`; the project is **The Archive**.

---

## Overview

Drop in a photo of a jacket. The app drafts a classification — category, colour,
style tags — and hands it to you to correct; nothing is archived until you
confirm it and give the piece a name. From there it joins a browsable closet
where you record what you paid, what it is made of, where it came from, and what
you think it is worth now. Filter by category and tag, lay up to five pieces over
a faceless mannequin as a 2.5D composition, run a Fit Check on the palette, and
save the result as a look.

All of it persists in your browser. There is no sign-up and no server holding
your wardrobe: by default, no wardrobe data, photo, or application API request
ever leaves the machine. (The page does fetch editorial fonts from Google Fonts,
with a system fallback. Two optional server layers exist for metadata lookups and
an experimental 3D track; both are off unless you configure them.)

The engineering worth reading is underneath the styling loop: a pure reducer that
receives every non-deterministic value through its action payloads, persistence
that degrades through three tiers instead of failing, image bytes stored apart
from metadata across two IndexedDB databases, and every network path gated behind
independent environment flags.

## Key Features

Everything here works with the repository as cloned, with no configuration.

- **Upload → confirm → archive.** A drafted classification you always approve or
  edit first; a name is required and the draft is never binding.
- **Real ownership metadata** — brand, subtype, colour + hex, style tags,
  material, size, purchase price + currency, retailer, purchase date, notes.
- **Five categories** — outerwear, tops, pants, shoes, accessories — each mapped
  to a mannequin body zone.
- **Category and tag filtering** across the closet.
- **On-device image processing** — in-browser downscaling, a manual canvas crop,
  and an optional edge-seeded flood-fill background removal. No image is
  uploaded.
- **Outfit composition** on a 2.5D layered mannequin, with a deterministic Fit
  Check over palette, tone and completeness, and a saved-looks board.
- **Manual market-value history** — timestamped estimates *you* type, with trend
  math against the purchase price. Nothing is fetched.
- **Local persistence** — IndexedDB, falling back to localStorage, falling back
  to in-memory.

Three **optional** integrations are off unless configured: product-metadata
prefill, consent-gated vision metadata drafting, and reference-candidate search.
An **experimental** image-to-3D lab is hidden behind a build flag. Details in
[Project Status](docs/PROJECT_STATUS.md).

## Tech Stack

Vite 6 · React 18 · TypeScript (strict) · plain CSS custom properties — no
CSS-in-JS, no utility framework · Vitest + Testing Library · ESLint 9 ·
GitHub Actions.

React and three.js are the only runtime dependencies, and three.js is reached
from exactly one lazy-loading site inside the experimental lab (three dynamic
imports: the core, `GLTFLoader`, `OrbitControls`) — the production build splits
them into chunks a default visitor never downloads.

The experimental service adds FastAPI, Pillow, NumPy, trimesh and pygltflib,
none of which the web app depends on.

## Architecture

Dependencies point downward, never up: `domain/` → `lib/` → `app/providers/` →
`components/`. Two optional server layers sit outside that stack and are inert
unless configured — three Vercel Edge functions in `api/`, and a local FastAPI
service in `backend/`. They are separate services with disjoint routes, not
duplicates.

See [Architecture](docs/ARCHITECTURE.md).

## Current Status

**Functional MVP (web).** The core loop is complete end to end and covered by
445 frontend and 65 backend tests. It has never been deployed and has no users.

See [Project Status](docs/PROJECT_STATUS.md) — the single source of truth for
what exists, what is partial, and what is not built.

## Running Locally

Requires **Node 22 or newer** (`.nvmrc` pins 24 LTS). Verified on 24, 25 and 26.

```bash
npm ci
npm run dev          # http://localhost:5173
```

In an empty studio, click **Load sample** for a procedural sample archive, or
**Upload** a clothing photo to archive your own piece.

Verification:

```bash
npm run typecheck    # strict; covers src/ and the api/ Edge functions
npm run lint
npm test             # 445 tests across 59 files
npm run build
```

Full setup, including the optional backend and every environment variable, is in
[Development](docs/DEVELOPMENT.md).

## Repository Structure

```
src/
  app/            App + ArchiveProvider, reducer, context, hook
  components/     ui/ closet/ outfit/ studio/ avatar/
  domain/         types, taxonomy, draft, fit check, market value (no browser APIs)
  lib/            storage/ ai/ image/ candidates/ productMatch/
  data/           procedural sample archive
  styles/         design tokens + globals
api/              optional Vercel Edge functions
backend/          experimental FastAPI service + pytest suite
docs/             current documentation
docs/archive/     historical planning documents (not current status)
eval/             cutout benchmark scaffolding (stub; no results; not in CI)
```

## Planned Direction

**Future work — none of this exists today.** Nearest first: archive
export/import, an end-to-end test suite, ML/WASM cutout segmentation, and a
possible React Native client (assessment only —
[Mobile Migration](docs/MOBILE_MIGRATION.md)).

Experimental 3D work is tracked separately in
[Avatar Track](docs/AVATAR_TRACK.md) and is not on the product path.

## Known Limitations

- **Not deployed.** No deployment configuration or live URL exists in the
  repository — no live demo, no users.
- **Browser-only storage, and no export yet** — clearing browser storage clears
  the archive.
- **The page fetches Google Fonts by default** — typefaces only, with a system
  fallback. No wardrobe data or photo is sent.
- **No authentication or accounts**, by design. No sync, no multi-device.
- **No text search or sorting.** Filtering is category and tag only.
- **The mannequin preview is 2.5D**, not 3D — layered photos, nothing fitted,
  draped, or simulated.
- **The default classifier is a deterministic local mock**, not recognition. The
  optional vision path produces a *draft* you still confirm.
- **Background removal is a flood fill**, not ML segmentation — good on clean
  flat-lay backgrounds, poor on busy ones.
- **Market values are numbers you typed.** Nothing is fetched or appraised.
- **The 3D lab is experimental**, hidden by default, and produces a proxy — not a
  garment reconstruction.
- **Requires Node 22+.** Node 20 and earlier cannot run the test suite: it needs
  `--no-experimental-webstorage`, a flag those versions reject.

## Documentation

| Document | Purpose |
| --- | --- |
| [Project Status](docs/PROJECT_STATUS.md) | **Source of truth** — what is implemented, partial, and planned |
| [Architecture](docs/ARCHITECTURE.md) | How the system is put together |
| [Development](docs/DEVELOPMENT.md) | Setup, environment variables, runtime matrix |
| [Portfolio Facts](docs/PORTFOLIO_FACTS.md) | Verified claims approved for external use |
| [Mobile Migration](docs/MOBILE_MIGRATION.md) | What a React Native port could reuse (assessment only) |
| [Avatar Track](docs/AVATAR_TRACK.md) | The experimental 3D research track |
| [AI Image Pipeline](docs/AI_IMAGE_PIPELINE.md) | How image analysis is wired |
| [QA Checklist](docs/QA_CHECKLIST.md) | Manual test pass |
| [`docs/archive/`](docs/archive/README.md) | Historical planning documents — **not** status |

`CLAUDE.md` and `AGENTS.md` are AI-agent working instructions, not product
documentation.
