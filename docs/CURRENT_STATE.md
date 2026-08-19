# Current state — The Archive

**Last verified: 2026-08-19**
**Verified against commit: `13bafb5`** — the most recent commit that touched
code, on branch `chore/career-ready-rehabilitation`. Every gate result below was
produced against that tree, and re-confirmed by cloning the branch to a clean
checkout and running both CI jobs there.

This is the **single source of truth** for what this repository contains. Every
other status claim — in `docs/archive/`, in a commit message, in a code comment —
is subordinate to this file. If you find a contradiction, this file is the one
being maintained; the other one is the bug.

Everything below was checked against the code, and every number was produced by
a command that was actually run (see [Verification](#verification)).

---

## What this is, in one paragraph

The Archive is a local-first web app for cataloguing the clothes you own:
photograph a piece, confirm a drafted classification, and it joins a browsable
digital closet you can style on a faceless mannequin and save as looks. It runs
entirely in the browser with no account and no server. Two optional extras sit
alongside it, both off unless configured: a set of Vercel Edge functions that
broker product-metadata and vision lookups, and a local FastAPI service used by
an **experimental** proxy-3D research track.

---

## Status at a glance

| Area | Status | Notes |
| --- | --- | --- |
| Garment archive (upload → confirm → archive) | **Stable** | Five categories incl. accessories. The drafted classification is never binding — the user confirms, and a name is required. |
| Garment metadata + editing | **Stable** | Brand, category, subtype, colour + hex, style tags, material, size, price + currency, retailer, purchase date, notes. |
| Local persistence | **Stable** | IndexedDB → localStorage → in-memory, chosen by probe. Writes gated on a `hydrated` flag. |
| Asset blob storage | **Stable** | Heavy cropped/cutout images as Blobs in a second IndexedDB database; metadata keeps a thumbnail + refs. Fail-closed orphan sweep with an age gate. |
| Manual crop | **Stable** | On-device canvas crop. Not automatic framing. |
| Local background removal (cutout) | **Stable, experimental quality** | On-device edge-seeded flood fill. Opt-in, skippable, quality varies with the photo. **Not** ML segmentation. |
| Closet / Lookbook / Mirror / Outfits | **Stable** | 2.5D layered mannequin composition and a saved-looks board. |
| Fit Check | **Stable** | A deterministic editorial read on the current outfit's palette, tone and completeness. No model involved. |
| Market-value history | **Stable — manual only** | Append-only timestamped estimates the **user types**. Nothing is fetched, and no value is "market data". |
| Product-metadata prefill (`api/product-meta`) | **Optional** | Off unless `VITE_API_BASE` is set. Reads a pasted product page's declared metadata. |
| Vision metadata draft (`api/analyze`) | **Optional** | Off unless `VITE_API_BASE` **and** `VITE_ANALYZER=vision`. Additionally requires a session-scoped consent gate. Falls back to the local mock on any failure. |
| Reference-candidate search (`api/candidate-search`) | **Optional** | Off unless `VITE_API_BASE` **and** `VITE_CANDIDATES=search`. eBay Browse API. |
| Proxy 3D Lab (frontend) | **Experimental, off by default** | Hidden unless `VITE_ENABLE_EXPERIMENTAL_3D` is set. Needs the local FastAPI backend running. |
| Proxy-3D backend (`/api/proxy-3d`) | **Experimental** | PNG → textured, lightly-extruded silhouette GLB. Synchronous. |
| Avatar jobs backend (`/api/jobs`) | **Experimental, unconsumed** | Async job surface with a procedural mannequin + bbox outfit fitter. **No frontend calls it.** |
| Async avatar jobs — frontend | **Not implemented** | Deliberately out of scope; see [Deliberately not built](#deliberately-not-built). |
| Body estimation / texture projection | **Not implemented** | Deterministic stubs that record honestly what they did not do. |
| Real garment fitting / virtual try-on | **Not implemented** | And not claimed anywhere. |
| Accounts, sync, cloud storage | **Not implemented** | Not planned. |
| Mobile app | **Not implemented** | Future migration target — see [`MOBILE_MIGRATION.md`](MOBILE_MIGRATION.md). |
| CI | **Stable** | `.github/workflows/ci.yml` — web + backend gates. |

---

## The three runtimes

These are genuinely separate and are easy to confuse, because two of them serve
paths under `/api`. See [`ARCHITECTURE.md`](ARCHITECTURE.md#api-routing--three-runtimes-one-prefix)
for the full picture.

1. **The web app** (`src/`) — Vite + React 18 + TypeScript strict, plain CSS.
   This is the product. It makes **no network calls at all** in its default
   configuration.
2. **Optional serverless functions** (`api/`) — three Vercel Edge functions.
   Reached by **absolute URL** built from `VITE_API_BASE`, so they are only ever
   called when that variable is configured. They do not run under `npm run dev`.
3. **The experimental local backend** (`backend/`) — FastAPI. Reached by the
   **relative** path `/api/proxy-3d`, which the Vite dev server proxies to
   `127.0.0.1:8000`. Only the Proxy 3D Lab talks to it, and only when the
   experimental flag is on.

---

## Core vs experimental — where the line is drawn

The wardrobe archive is the product. The Proxy 3D Lab is a research track, and
as of this commit it is **opt-in**:

- `VITE_ENABLE_EXPERIMENTAL_3D` unset (the default) → the lab's navigation entry
  is not listed, the closet withholds its 3D action *and* the matching
  saved-preview badge, the lab component is never mounted, and three.js — which
  is only ever reached through a dynamic `import()` inside the GLB viewer — is
  never loaded.
- Set it to `true` → everything behaves exactly as before.

The flag changes only what is **reachable**. It is read once in
`ArchiveStudio.tsx` and used to decide what to render and which callback to pass
down — it reaches no storage code, so there is no path by which it could read,
write, or clear the `proxy3dPreview` metadata on an archived piece. Toggling it
in either direction is lossless.

Both halves of the boundary are tested: the default build in
`src/app/App.test.tsx`, `components/studio/SidebarNav.test.tsx` and
`views.test.ts`; the enabled build in `src/app/App.experimental3d.test.tsx`,
which drives the real env variable through a full `<App/>` mount and is verified
to fail when the flag is not honoured. That the preview metadata itself survives
save/load and reload is covered separately, by
`lib/storage/proxy3dPreviewPersistence.test.ts` and
`app/providers/ArchiveProvider.proxy3d.test.tsx`.

Implementation: `src/lib/featureFlags.ts` (a pure function over an injected env
slice, matching the existing `resolveApiBase` / `selectAnalyzerKind` seams),
`visibleViewOrder` in `src/components/studio/views.ts`, and three wiring points
in `src/components/studio/ArchiveStudio.tsx`.

**Note on bundle size.** Gating navigation is what keeps three.js from loading,
because the dynamic import lives behind the viewer. The lab's own component code
is still statically imported into the main chunk (283 kB), which is a deliberate
trade: `React.lazy` would shave a few kB off a chunk that is already dominated by
the app itself, at the cost of a Suspense boundary and the test churn around it.

---

## Deliberately not built

Do not treat these as bugs or as "next up". They are scoped out on purpose.

- **The async avatar jobs frontend.** `POST /api/jobs`, `GET /api/jobs/{id}`, and
  `GET /api/jobs/{id}/result.glb` all exist and are covered by backend tests, but
  nothing in `src/` calls them. There is no button, no polling loop, and no
  claim in the UI that this feature exists. Finishing it is a real piece of work
  and would need its own scope.
- **Real body estimation and texture projection.** `DummyBodyEstimator` returns
  canned proportions and `DummyTextureProjector` is a pass-through. Both append
  a note to the job's provenance trail saying so.
- **ML/WASM cutout segmentation.** The seams are in place
  (`lib/image/garmentCutout.ts`, `lib/storage/assetBlobStore.ts`); the
  implementation is not.

---

## Verification

Run on **Node 20.20.2** (`.nvmrc` pins Node 20; the suite fails on Node 25 —
jsdom's `localStorage` is shadowed by a native implementation the tests cannot
reset) and **Python 3.12.13**.

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | Pass (strict, exit 0) — covers `src/` **and** the `api/` Edge functions |
| Lint | `npm run lint` | Pass (exit 0) |
| Web tests | `npm test` | **445 passed** across **59 files** |
| Build | `npm run build` | Pass — main chunk 282.91 kB, three.js 732.83 kB as a separate lazy chunk |
| Backend tests | `python -m pytest backend` | **65 passed**, 1 warning |

The single remaining backend warning is third-party
(`StarletteDeprecationWarning` about `httpx` in `starlette.testclient`), not this
project's code. It is left alone rather than chased with a dependency bump.

---

## Known technical debt

Ordered by what actually costs something.

1. **The optional serverless routes are unauthenticated and send
   `Access-Control-Allow-Origin: *`.** `api/analyze.ts`, `api/product-meta.ts`,
   and `api/candidate-search.ts` have no auth, no rate limit, and no request-size
   cap, while `analyze` spends `ANTHROPIC_API_KEY` and `candidate-search` spends
   eBay credentials on every call. **This is a deployment risk, not a leak** —
   the keys are correctly server-only and the app makes no calls with the env
   unset. A written fix (origin allowlist, token cache, per-caller throttle)
   exists on the unmerged branch `thread/api-hardening`. **Do not deploy `api/`
   to a public URL with real keys until that is merged and reviewed.**
2. **Six unmerged `thread/*` branches.** `api-hardening`, `docs-ci`,
   `ebay-mapping`, `json-export`, `price-domain`, `texture-projector`. From the
   outside, only `main` is visible, so this work reads as absent. Each needs to
   be merged or deleted.
3. **`main` is behind.** The wardrobe work (market value, candidate search,
   editorial polish) lives on branches; `main` is at "push everything".
4. **No `LICENSE`.** A public repository with no licence is legally
   "all rights reserved", which discourages the reading a portfolio wants. This
   is a legal choice, so it is left to the owner.
5. **`IMG_0198.jpg` remains in git history.** The file was removed from the
   working tree, but a genuine purge would need `git filter-repo` and a
   force-push — an owner's decision. Recover it with
   `git show 319b673:IMG_0198.jpg > IMG_0198.jpg` if it is ever wanted.
6. **Node 20 is pinned, and Node 20 is past its LTS maintenance window.** The
   pin is not a preference: the Vitest suite fails on Node 25 because newer Node
   provides a native `localStorage` that shadows jsdom's, and the tests cannot
   reset it. Node 22 and 24 were **not** tested. Moving to a current LTS means
   making the jsdom storage setup deterministic first (likely an explicit
   storage stub in `src/test/setup.ts`) and only then bumping `.nvmrc`,
   `engines`, and CI. That is a real piece of work, not a version bump.
7. **`backend/requirements.txt` has no upper bounds.** Every entry is a `>=`
   floor, so a fresh install resolves whatever is newest — verified: a clean
   install today pulls trimesh **5.0.0** and FastAPI **0.141.1**, two majors
   ahead of the checked-in virtualenv's trimesh 4.12.2. The suite passes on
   both, but nothing prevents a future release from breaking CI without a
   commit. Pinning, or adding upper bounds, would make backend CI reproducible.
8. **The `eval/cutout` harness is a stub.** Scaffolding for a cutout benchmark
   with no results committed. It is excluded from lint and from CI.
9. **The repository is named `wadrobe`** (missing the `r`). Renaming it on
   GitHub is a one-click improvement; GitHub redirects the old URL.

---

## Where to go next

See [`DEVELOPMENT.md`](DEVELOPMENT.md) to run it, [`ARCHITECTURE.md`](ARCHITECTURE.md)
for how it is put together, [`AVATAR_TRACK.md`](AVATAR_TRACK.md) for the
experimental 3D track, and [`MOBILE_MIGRATION.md`](MOBILE_MIGRATION.md) for what
a React Native port would and would not be able to reuse.
