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

## What is product, and what is experiment

The repository contains research alongside the product. The boundary is
explicit, so nothing here has to be guessed at:

| | Scope | Status |
| --- | --- | --- |
| **Core product** | The wardrobe archive: upload, image preparation, local persistence, backup/restore, filtering, outfit composition, Fit Check | **IMPLEMENTED** |
| **Optional integrations** (`api/`) | Product-metadata prefill, vision metadata drafting, listing search | **OPTIONAL PROTOTYPE** — off by default, and 404 unless `ENABLE_OPTIONAL_APIS=true` |
| **Connected experiment** | Proxy 3D Lab + `/api/proxy-3d` | **EXPERIMENTAL** — hidden unless `VITE_ENABLE_EXPERIMENTAL_3D`, needs the local Python service |
| **Isolated experiments** | `/api/jobs` avatar pipeline, `eval/` cutout benchmark | **EXPERIMENTAL / INCOMPLETE** — no frontend consumes either; see [`backend/EXPERIMENT.md`](backend/EXPERIMENT.md) and [`eval/README.md`](eval/README.md) |

Everything under "core product" works from a clean clone with no configuration.

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
  Check over palette, tone and completeness, and a saved-looks board. An
  accepted cutout is placed by its *measured content*, so a garment sits on the
  body rather than being dropped into a rectangle; anything without measurable
  transparency keeps an honest matted panel.
- **Manual market-value history** — timestamped estimates *you* type, with trend
  math against the purchase price. Nothing is fetched.
- **Local persistence** — IndexedDB, falling back to localStorage, falling back
  to in-memory — and it *tells you which*: writes are acknowledged, so a failed
  or non-durable save is reported rather than silently assumed.
- **Backup and restore** — export the whole archive, images included, to a
  versioned JSON file; import it back with a merge-or-replace choice and a
  preview of exactly what will change.
- **Multi-tab safe** — a second tab cannot silently overwrite an archive the
  first one has changed.

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

**Functional MVP (web), mobile-first.** The core loop is complete end to end and
covered by 705 unit, 20 browser and 75 backend tests. It has never been deployed
and has no users.

See [Project Status](docs/PROJECT_STATUS.md) — the single source of truth for
what exists, what is partial, and what is not built.

## Running Locally

Requires **Node 22 or newer** (`.nvmrc` pins 24 LTS). Verified on 24, 25 and 26.
Node 20 and earlier cannot run the test suite — it needs a flag they reject.

```bash
npm ci
npm run dev          # http://localhost:5173
```

You land in the **Closet**. From an empty one, click **Load sample** for a
procedural sample archive, or **Add** a clothing photo to archive your own piece.
On a phone the sidebar is replaced by a bottom bar with Add at its centre.

Verification:

```bash
npm run typecheck    # strict; covers src/ and the api/ Edge functions
npm run lint
npm test             # 705 unit + component tests
npm run build
npm run test:e2e     # 10 Playwright specs, desktop + mobile
```

The experimental backend has its own suite:

```bash
python -m pytest backend    # 75 tests
```

Full setup, including the optional backend and every environment variable, is in
[Development](docs/DEVELOPMENT.md).

## Repository Structure

```
src/
  app/            App + ArchiveProvider, reducer, context, hook
  components/     ui/ closet/ outfit/ studio/ navigation/ avatar/
  domain/         types, taxonomy, draft, fit check, market value (no browser APIs)
  lib/            storage/ ai/ image/ candidates/ productMatch/
  data/           procedural sample archive
  styles/         design tokens + globals
api/              optional Vercel Edge functions
backend/          experimental FastAPI service + pytest suite
docs/             current documentation
docs/archive/     historical planning documents (not current status)
e2e/              Playwright browser tests
eval/             ISOLATED EXPERIMENT — cutout benchmark scaffolding, no results
```

## Planned Direction

Current direction is the **Core v1 revival**: a mobile-first wardrobe archive
and outfit studio, with the experimental 3D track kept isolated rather than
promoted. See [Revival Roadmap](docs/REVIVAL_ROADMAP.md) for the phased plan and
[Revival Backlog](docs/REVIVAL_BACKLOG.md) for what has been deliberately
deferred.

**Future work — none of this exists today.** Nearest first: ML/WASM cutout
segmentation, richer filtering and search, and a possible React Native client
(assessment only — [Mobile Migration](docs/MOBILE_MIGRATION.md)).

Experimental 3D work is tracked separately in
[Avatar Track](docs/AVATAR_TRACK.md) and is not on the product path.

## Known Limitations

- **Not deployed.** No deployment configuration or live URL exists in the
  repository — no live demo, no users.
- **Browser-only storage.** No accounts, no sync, no multi-device. Export a
  backup to move an archive or guard against clearing site data.
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
  garment reconstruction. The `/api/jobs` avatar pipeline has **no frontend at
  all** and is not on the product path.
- **The optional `api/` routes are prototypes.** They are 404 unless
  `ENABLE_OPTIONAL_APIS=true`, and there is no authentication in front of them —
  they are intended for local or private use, not a public deployment.
- **Requires Node 22+.** Node 20 and earlier cannot run the test suite: it needs
  `--no-experimental-webstorage`, a flag those versions reject.

## Documentation

| Document | Purpose |
| --- | --- |
| [Project Status](docs/PROJECT_STATUS.md) | **Source of truth** — what is implemented, partial, and planned |
| [Revival Roadmap](docs/REVIVAL_ROADMAP.md) | **Source of truth for direction** — Core v1 definition and phases |
| [Revival Backlog](docs/REVIVAL_BACKLOG.md) | Deferred ideas, and why each was deferred |
| [Revival Phase 0–2 Report](docs/REVIVAL_PHASE_0_2_REPORT.md) | What the revival pass changed, verified, and left undone |
| [Architecture](docs/ARCHITECTURE.md) | How the system is put together |
| [Development](docs/DEVELOPMENT.md) | Setup, environment variables, runtime matrix |
| [Portfolio Facts](docs/PORTFOLIO_FACTS.md) | Verified claims approved for external use |
| [Mobile Migration](docs/MOBILE_MIGRATION.md) | What a React Native port could reuse (assessment only) |
| [Avatar Track](docs/AVATAR_TRACK.md) | The experimental 3D research track |
| [AI Image Pipeline](docs/AI_IMAGE_PIPELINE.md) | How image analysis is wired |
| [QA Checklist](docs/QA_CHECKLIST.md) | Manual test pass |
| [`backend/EXPERIMENT.md`](backend/EXPERIMENT.md) | What in the backend is connected vs isolated |
| [`docs/archive/`](docs/archive/README.md) | Historical planning documents — **not** status |

`CLAUDE.md` and `AGENTS.md` are AI-agent working instructions, not product
documentation.
