# Portfolio Facts

Last verified: 2026-08-21
Verified against: commit `9f3d181` plus the uncommitted documentation changes of
this pass.

> **This is the only approved factual source for external use** — Developer Hub,
> résumé, applications, interviews. Every sentence here is defensible from the
> repository. If a claim is not in this file, do not make it.
>
> Derived from [`PROJECT_STATUS.md`](PROJECT_STATUS.md), which is the underlying
> source of truth.

---

## 1. Identity

- **Project name:** The Archive
- **Repository:** `EdwardH-jedi/wadrobe` (the repository name is misspelled; the
  project is "The Archive")
- **Project type:** Local-first web application (single-page, browser-only)
- **Status:** Active. Functional MVP. No deployment configuration, live URL, or
  deployment evidence exists in the repository; treated as not deployed, with no
  users.

## 2. One-Line Description

> A local-first web app for cataloguing the clothes you own: photograph a piece,
> confirm a drafted classification, and browse, filter and style your wardrobe on
> a 2.5D mannequin — with no account, no server, and no data leaving the browser.

Longer variant, if a paragraph is wanted:

> The Archive is a browser-only digital wardrobe. It handles the full loop from
> photo to archived garment — on-device image processing, a confirm-before-save
> classification step, real ownership metadata, category and tag filtering, and
> outfit composition on a layered mannequin — backed by a three-tier persistence
> layer that degrades rather than fails. An optional, consent-gated cloud vision
> path can draft metadata, and an experimental image-to-3D research track sits
> behind a feature flag.

## 3. Problem

People own more clothing than they can hold in their head. Existing options are
either a spreadsheet (no images, no styling) or a social wardrobe app (an
account, a server, and your photos on someone else's infrastructure).

The Archive is for cataloguing a personal wardrobe in detail — what a piece is,
what it cost, what it is made of, what it is worth now — and seeing pieces
together before wearing them, without handing that inventory to a third party.
The local-first constraint is the product decision, not a limitation to apologise
for.

## 4. What I Built

- **The full upload-to-archive pipeline.** File validation, in-browser
  downscaling, dominant-colour sampling, a manual canvas crop, an optional
  on-device background-removal cutout, a drafted classification, and a
  mandatory user-confirmation step before anything is saved.
- **The domain and state layer.** A pure reducer plus a provider, with every
  non-deterministic value (ids, timestamps, events) injected through action
  payloads so the domain is testable without mocking clocks or crypto.
- **The persistence layer.** A three-tier storage facade (IndexedDB →
  localStorage → in-memory) and a separate IndexedDB blob store for heavy image
  bytes, with hydration gating, an object-URL lifecycle, and a fail-closed
  orphan-blob sweep.
- **On-device image processing.** Crop geometry as pure math separated from the
  canvas that applies it; an edge-seeded flood-fill cutout behind a swappable
  adapter.
- **The wardrobe UI.** Five views, category and tag filtering, outfit slots,
  a 2.5D layered mannequin composition, and a saved-looks board — plain CSS
  custom properties, no component framework.
- **Optional server integrations.** Three Vercel Edge functions (vision metadata
  drafting, product-page metadata parsing, eBay candidate search), each behind
  its own environment flag and off by default. The product-URL path is
  SSRF-guarded and re-validates every redirect hop; the vision path — the only
  one that transmits a photo — additionally requires a session-scoped consent
  gate. Gating is enforced in frontend provider selection, not inside every
  deployed handler.
- **An experimental Python service.** FastAPI + trimesh, with two independent
  surfaces: `/api/proxy-3d`, which generates a proxy-3D GLB from a transparent
  PNG synchronously and is the one the frontend can call; and a separate async
  `/api/jobs` avatar-build experiment structured as five injectable stage
  Protocols, which **no frontend consumes**.
- **The test and CI baseline.** 445 web tests, 65 backend tests, strict
  TypeScript across two compilation units, and a GitHub Actions workflow.

## 5. Technical Ownership

Primary author; every area below is my own work. For completeness, git history
contains exactly one commit by another contributor (`smyeong123`), a
documentation-only test commit touching `README.md`. No code was contributed by
anyone else.

### Web / frontend
React 18 + TypeScript (strict), Vite, plain CSS design tokens. Component
architecture, state management, the full UI, and the image-processing pipeline.

### Backend (optional / experimental)
Three Vercel Edge functions in TypeScript. One FastAPI service in Python doing
mesh generation with trimesh, NumPy and Pillow.

### Data
The domain model, the storage adapter interface and its three implementations,
the blob store, and the dehydrate/hydrate cycle that keeps image bytes out of
metadata.

### Infrastructure
GitHub Actions CI (web + backend jobs, dependency caching, Node and Python
version pinning). No deployment infrastructure — the project has never been
deployed.

## 6. Verified Technology Stack

| Area | Technology |
| --- | --- |
| Language | TypeScript (strict mode); Python 3.12 for the experimental service |
| Web framework | React 18 |
| Build tooling | Vite 6 |
| Styling | Plain CSS custom properties — no CSS-in-JS, no utility framework |
| Client storage | IndexedDB, with localStorage and in-memory fallbacks |
| Image processing | Canvas 2D (downscale, crop, flood-fill cutout) |
| 3D (experimental) | three.js, loaded only via dynamic import |
| Serverless | Vercel Edge Functions |
| Experimental service | FastAPI, trimesh, NumPy, Pillow, pygltflib |
| Testing | Vitest, Testing Library, jsdom, pytest |
| Linting | ESLint 9 (flat config) |
| CI | GitHub Actions |

## 7. Architecture Facts

- Strict downward layering: `domain/` → `lib/` → `app/providers/` →
  `components/`. **No file in `src/domain/` touches a browser API** — verified
  both by static scan and by importing every domain module with nine browser
  globals deleted from the global object.
- State is a **pure reducer**; all `Date.now()` and `crypto` calls live in the
  provider's action creators.
- **Three distinct runtimes**, two of which serve paths under `/api`: the browser
  app, the Vercel Edge functions (absolute URL from `VITE_API_BASE`), and the
  local FastAPI service (relative `/api/proxy-3d`, via the Vite dev proxy).
- **three.js is reached from exactly one lazy-loading site** (three dynamic
  imports in one `Promise.all`: core, `GLTFLoader`, `OrbitControls`), so the
  default visitor never downloads it — confirmed by the build's chunk split: a
  283 kB main chunk and a 733 kB three.js chunk.
- Network access is **AND-gated**: enabling the product-URL lookup cannot
  silently enable photo transmission, which needs a second flag *and* a
  session-scoped consent gate.

## 8. Verified Features

1. Photo-to-archive upload flow with a mandatory confirm-before-save step.
2. Full ownership metadata per garment — brand, subtype, colour, tags, material,
   size, price, currency, retailer, purchase date, notes.
3. On-device manual crop and optional background-removal cutout, both running in
   the browser with no upload.
4. Category and tag filtering across five garment categories.
5. Outfit composition on a 2.5D layered mannequin, with a deterministic Fit Check
   over palette, tone and completeness.
6. Saved looks — persisted, restorable, deletable.
7. Manual market-value history with trend math against the purchase price.
8. Three-tier local persistence that degrades instead of failing, with image
   bytes stored separately from metadata.
9. Optional, consent-gated cloud vision metadata drafting — off by default.
10. An experimental image-to-3D proxy lab behind a build flag.

## 9. Engineering Evidence

| Evidence | Value |
| --- | --- |
| Unit / component tests | 551 passing, across 69 files |
| Backend tests | 71 passing (pytest) |
| Typecheck | Strict, across two compilation units (`src/` and `api/`) |
| Build | Passing; 283 kB main chunk, three.js split into a 733 kB lazy chunk |
| CI | GitHub Actions — web (Node 24 LTS), Playwright, and backend (Python 3.12) jobs |
| Serverless endpoints | 3 (`analyze`, `product-meta`, `candidate-search`) |
| Experimental API routes | 6 (proxy-3D generate/status/result; jobs create/status/result) |
| Garment metadata fields | 15+ user-facing, plus analysis-provenance fields |
| Storage backends implemented | 3 (IndexedDB, localStorage, in-memory) behind one adapter interface |
| Copy-honesty guard | `src/test/honesty.ts` — shared forbidden-term regexes, applied by 7 test files to the centralized copy constants (not a repo-wide string scan) |

No adoption, performance, or user numbers are claimed, because none exist.

## 10. Engineering Challenges

- **Storing image bytes without blowing the storage quota.** Metadata keeps a
  downscaled thumbnail plus blob references while heavy cropped/cutout images
  live in a second IndexedDB database. A `put()` resolves only after its
  transaction commits, so a reference is never attached to a blob that did not
  land — and because a thumbnail is always present, a lost blob degrades the
  preview instead of losing the piece.
- **Reclaiming orphaned blobs safely across tabs.** The sweep is fail-closed and
  deletes only blobs that are unreferenced, older than an age gate, and observed
  through a metadata read that returned `ok` — so a second tab mid-write cannot
  have its blobs collected.
- **Display-image precedence.** Five possible sources per garment resolved by one
  function, ordered so an unaccepted cutout can never shadow a display choice the
  user made deliberately.
- **Keeping a heavy dependency out of the default bundle.** three.js is reachable
  only through a single dynamic import behind a feature flag; the production
  build's chunk split is the proof.
- **Making honesty a test.** Product copy is easy to inflate over time, so
  shared forbidden-term regexes are asserted against the centralized copy
  constants (upload flow, proxy-3D flow, market value, product match, cutout).
  It guards those constants, not every string in the UI — but those are where
  the prominent claims live.
- **Keeping the domain layer platform-free**, which is what would make a future
  mobile port tractable — verified by importing every domain module with the
  browser globals removed.

## 11. Engineering Decisions

- **Local-first, no backend for wardrobe data.** Removes accounts and sync
  entirely, and eliminates server-side storage of anyone's wardrobe. It reduces
  rather than eliminates network exposure: the default page still fetches Google
  Fonts, and the opt-in paths transmit a URL or (with consent) a photo. The cost
  — no multi-device, no export yet — is accepted and documented.
- **Pure reducer with injected non-determinism.** More verbose action creators,
  in exchange for a domain layer testable without fakes.
- **Degrade rather than fail.** Storage probes down three tiers; a failed cloud
  call falls back to the local mock; a missing blob falls back to the thumbnail.
- **Two independent env flags per network path.** Configuring a backend for URL
  lookups must not silently start transmitting photos.
- **Plain CSS over a component library.** A dark editorial aesthetic driven by
  design tokens, with no framework to fight.
- **Experimental work behind a flag, not deleted.** The 3D track stays in the
  repository, hidden by default, honestly labelled.

## 12. Validation Evidence

Run on Node 24.19.0 (also verified on 25.8.0 and 26.7.0) and Python 3.12.13.

| Check | Command | Result |
| --- | --- | --- |
| Tests (web) | `npm test` | **PASS** — 551 tests, 69 files |
| Tests (backend) | `python -m pytest backend` | **PASS** — 71 tests |
| Lint | `npm run lint` | **PASS** |
| Typecheck | `npm run typecheck` | **PASS** (strict, `src/` + `api/`) |
| Build | `npm run build` | **PASS** |
| Backend startup | `uvicorn app.main:app --app-dir backend` | **PASS** |
| CI | `.github/workflows/ci.yml` | Configured; **not yet run remotely** (nothing pushed) |

## 13. Known Limitations

State these plainly — they are not disqualifying, and hiding them is.

- **Not deployed.** No deployment configuration, live URL, or deployment
  evidence exists in the repository — no production environment, no live demo,
  no users.
- **Browser-only storage.** No sync and no multi-device; a backup file is the
  only way to move or recover an archive.
- **The default page fetches Google Fonts** — the one external request made with
  no configuration. Typefaces only; no wardrobe data or photo is involved, and it
  falls back to a system serif. "Local-first" describes wardrobe data, not a
  strictly zero-network page.
- **No authentication or user accounts**, by design.
- **No text search or sorting.** Filtering is category and tag only.
- **The mannequin is 2.5D**, a layered photo composition. Nothing is fitted,
  draped, or simulated.
- **The default classifier is a deterministic local mock**, not recognition.
- **Background removal is a flood fill**, not ML segmentation. It works well on
  clean flat-lay backgrounds and poorly on busy ones.
- **The cloud paths are unverified end to end** against the live APIs.
- **The 3D lab is experimental and hidden by default**, and produces a proxy —
  an extruded silhouette, not a garment reconstruction.
- **The async avatar jobs API has no frontend.** Backend only, deliberately.
- **Market values are numbers the user typed.** Nothing is fetched or appraised.
- **The canvas upload path has no real-browser coverage** — the Playwright suite
  deliberately avoids driving a file picker plus canvas decode.
- **Requires Node 22+** — the test suite needs a flag older Node rejects.
- **The optional `api/` routes are prototypes**, 404 by default, with no
  authentication; intended for local or private use, not public deployment.

## 14. Safe Portfolio Claims

Every sentence below is defensible from the repository.

- "Built a local-first digital wardrobe web app in React and TypeScript (strict),
  covering the full loop from photo upload to archived garment to outfit
  composition."
- "Designed a three-tier persistence layer — IndexedDB, localStorage, in-memory —
  behind a single adapter interface that degrades instead of failing."
- "Separated image bytes from metadata across two IndexedDB databases, with a
  fail-closed orphan-blob sweep, so a lost asset degrades a preview rather than
  losing a record."
- "Implemented on-device image processing — downscaling, manual crop, and an
  edge-seeded flood-fill background removal — with no image ever uploaded by
  default."
- "Built the state layer as a pure reducer with all non-determinism injected
  through action payloads, making the domain testable without mocking time or
  crypto."
- "Kept the domain layer free of browser APIs, verified by importing every module
  with the browser globals removed — the property a future mobile port depends
  on."
- "Added three optional cloud integrations as Vercel Edge Functions, all off by
  default and each behind its own environment flag: product-page metadata
  parsing (SSRF-guarded, re-validating every redirect hop), listing search, and
  vision metadata drafting — the last additionally behind a session-scoped
  consent gate, because it is the only path that transmits a photo."
- "Kept a 733 kB three.js dependency out of the default bundle behind a single
  lazy-loading site and a feature flag, verified by the production chunk split."
- "Wrote 445 frontend and 65 backend tests, with strict TypeScript across two
  compilation units and a GitHub Actions pipeline configured to run both on every
  pull request and push to main."
- "Enforced honest product copy with automated tests — shared forbidden-term
  regexes asserted by seven test files against the centralized user-facing copy
  constants, so the most prominent product wording cannot start claiming AI
  recognition or virtual try-on without a test failing."
- "Built an experimental Python service (FastAPI, trimesh) that generates
  proxy-3D GLB artifacts from transparent PNGs, reachable from the web app only
  behind a build flag — plus a separate, deliberately unconsumed async job API
  structured as five injectable pipeline stages."

## 15. Claims That Must NOT Be Used

These are tempting and unsupported. The repository's own honesty tests forbid
most of this wording in product copy, and `CLAUDE.md` §3 forbids it in docs.

```text
AI-powered stylist / AI styling assistant
personalised outfit recommendations
smart wardrobe / intelligent wardrobe
computer vision garment recognition
automatic background removal
virtual try-on / 3D try-on / accurate fit / true-to-size
real-time market valuation / live resale pricing
production-ready / production-grade
scalable platform / large-scale wardrobe platform
social fashion network / community features
cloud-synced wardrobe / multi-device sync
machine learning segmentation
exact / official product identification
```

Specific traps worth naming:

- **"AI" is not entirely off-limits — precision matters.** "Optional,
  consent-gated AI metadata drafting, off by default" is defensible. "An
  AI-powered wardrobe assistant" is not: the default path is a deterministic
  mock, and the optional path produces a draft the user must confirm.
- **"3D" is defensible only for the experimental lab**, and only as "proxy 3D" or
  "image-to-3D proxy". Never "3D try-on" or "3D fitting".
- **Never call the mannequin preview 3D.** It is a 2.5D layered composition.
- **"Recommendations" needs the same care as "AI".** Deterministic, rule-based
  styling hints do exist (Fit Check, `silhouetteHint`). Describing them as
  "rule-based styling hints" is fine; "personalised recommendations" or a
  "recommendation engine" is not — nothing is learned, ranked, or personalised.
- **Never imply deployment or users.** No deployment evidence exists.

## 16. Developer Hub Sync

Fields safe to consume directly from this document:

| Field | Source |
| --- | --- |
| `project_name` | §1 — "The Archive" |
| `repository` | §1 |
| `project_type` | §1 — "Local-first web application" |
| `status` | §1 — "Active · Functional MVP · Not deployed" |
| `one_liner` | §2 (first block quote) |
| `description` | §2 (longer variant) |
| `problem` | §3 |
| `tech_stack` | §6 table |
| `features` | §8 (pick 3–5) |
| `highlights` | §14 |
| `limitations` | §13 |
| `metrics` | §9 — engineering evidence only; no adoption or performance numbers |

Do **not** synthesise fields not listed here. In particular there is no demo
URL, no user count, no uptime figure, and no performance benchmark, because none
of those exist.
