# Project Status

Last verified: 2026-08-21
Repository: EdwardH-jedi/wadrobe
Default branch: `main` — **stale.** All current work is on
`chore/career-ready-rehabilitation`; `main` sits at "push everything" and is
many features behind. See [§10](#10-technical-debt).
Verified against: commit `9f3d181` plus the uncommitted documentation changes of
this pass.
Status: **Active**

> This is the canonical implementation-state document. Where any other document
> — a README, a comment, anything in `docs/archive/` — disagrees with this file,
> this file is the one being maintained and the other is the bug. Everything
> below was checked against source, tests, or a command that was actually run.

---

## 1. Project Summary

The Archive is a **local-first web application for cataloguing the clothes you
own.** You upload a photo of a garment, the app drafts a classification you
correct and confirm, and the piece joins a browsable digital closet holding real
metadata — brand, material, size, what you paid, where you bought it, what you
think it is worth now. You can filter the closet by category and tag, lay up to
five pieces over a faceless mannequin as a **2.5D layered composition**, run a
deterministic "Fit Check" on the palette, and save the result as a look.

It runs entirely in the browser. There is no account and no server holding
wardrobe data: in the default configuration, no wardrobe record, photo, or
application API request leaves the machine. The one external request the default
page makes is to Google Fonts for the editorial typefaces (system fallback if it
fails).

**What it is not:** it is not a mobile app, not a learned or personalised
recommendation engine, and not virtual try-on. (It does offer *deterministic,
rule-based* styling hints — the Fit Check and `silhouetteHint` say things like
"Add shoes to ground the look" from fixed rules over the selected categories.
Nothing is learned, ranked, or personalised.) Two optional extras sit alongside
the core and are off unless explicitly configured: three Vercel Edge functions
for product-metadata and vision lookups, and a local FastAPI service used by an
experimental proxy-3D research track.

## 2. Current Stage

**Functional MVP (web).** The core loop — upload → confirm → archive → filter →
style → Fit Check → save look → persist — is complete end to end and covered by
tests. It has never been deployed and has no users.

It is not a prototype (the flows are finished, not sketched), and it is not
production software (no deployment, no auth, no multi-device sync, and the
optional serverless layer is unhardened — see [§10](#10-technical-debt)).

## 3. Implemented

### Wardrobe management
- Create a piece from a photo through a guided upload flow. The drafted
  classification is **never binding**: the user confirms or edits it, and a name
  is required before anything is archived.
- Edit any field of an archived piece.
- Delete a piece (its owned image blobs are cleaned up with it).
- Load a procedurally-generated sample archive on demand — an explicit user
  action, not seeded state.

### Item metadata
Name, brand, category, subtype, colour (label + hex swatch), style tags,
material, size, purchase price + currency, retailer, purchase date, notes.
Plus provenance fields recording which analyzer produced the draft, its
confidence, and whether the user edited it.

### Organisation
- **Five categories:** outerwear, tops, pants, shoes, accessories — each mapped
  to a body zone on the mannequin.
- **Category filtering** via tabs with live counts (`CategoryTabs.tsx`).
- **Tag filtering**, combinable with the category filter (`ClosetPanel.tsx:47`).

There is no text search and no sort control. See [§5](#5-planned--not-implemented).

### Image handling
- Photos are downscaled to thumbnails in-browser before storage.
- **Manual crop** — an on-device canvas crop (`lib/image/cropImage.ts`), driven
  by pure geometry in `cropGeometry.ts`.
- **Local background removal** — an on-device, edge-seeded flood fill producing
  a transparent cutout (`lib/image/garmentCutout.ts`). Opt-in, skippable, and
  non-blocking. This is a **classical algorithm, not ML segmentation**; quality
  varies with the photo background.
- A single precedence function, `getGarmentDisplayImage`, decides what every
  surface renders: `displayImageUrl → cutoutImageUrl → croppedImageUrl →
  originalImageUrl → imageDataUrl`.

### Outfits
Select one piece per category slot, layer them over the mannequin, run a Fit
Check (a deterministic read on palette, tone and completeness — no model
involved), save the look to a board, restore it, delete it.

### Market-value history
Append-only, timestamped estimates **the user types**, with trend math against
the original purchase price. Nothing is fetched; no value here is market data.

### Navigation / UI
Five views — Studio, Closet, Lookbook, Mirror, Outfits — plus a persistent
garment filmstrip and modal upload/edit flows. Dark editorial theme built on
plain CSS custom properties. `prefers-reduced-motion` respected globally.

### Persistence
Three-tier, chosen by probe at startup: **IndexedDB → localStorage →
in-memory**. Writes are gated on a `hydrated` flag so an initial empty state can
never overwrite stored data. Heavy cropped/cutout images live as Blobs in a
second IndexedDB database, with a fail-closed orphan sweep behind an age gate.

### Testing
445 tests across 59 files (Vitest + Testing Library, jsdom) and 65 backend tests
(pytest). Includes an unusual guard: `src/test/honesty.ts` exports forbidden-term
regexes that seven test files enforce against user-facing copy, so the product
cannot start claiming AI recognition, virtual try-on, or exact product matching
without a test failing.

### CI
`.github/workflows/ci.yml` — a web job (Node 24 LTS), a Playwright browser job,
and a backend job (Python 3.12).
See [§6](#6-validation).

## 4. Partially Implemented

**Optional cloud vision metadata drafting**
- Working: the full path is implemented and unit-tested — `createAnalyzer.ts`
  selects it, `api/analyze.ts` calls a Claude vision model, `parseVisionGuess`
  normalises the response, a session-scoped consent gate guards transmission,
  and any failure falls back to the local mock.
- Missing: no evidence it has ever run end to end against the live API. The
  tests exercise the parsing seam with fixtures. It also requires `vercel dev`
  or a deployment — `npm run dev` does not serve `api/`.

**Optional reference-candidate search (eBay Browse)**
- Working: query building, candidate mapping, an SSRF URL guard, OAuth
  client-credentials flow, and fallback to local mock candidates on failure or
  zero results.
- Missing: same as above — unverified against the live eBay API, and the
  endpoint is unhardened.

**Experimental Proxy 3D Lab**
- Working: PNG → GLB generation via the local FastAPI service, a three.js
  viewer, per-side cutout-first flows, dual-sided front/back generation, manual
  back alignment, and a closet bridge linking a piece to its generated preview.
- Missing: it is **hidden by default** (`VITE_ENABLE_EXPERIMENTAL_3D`) and
  requires the local backend running. The artifact is a proxy — a textured,
  lightly-extruded silhouette — not a garment reconstruction.

**Experimental avatar jobs backend**
- Working: `POST /api/jobs`, status and result endpoints, an async job store,
  five injectable pipeline stages, a procedural trimesh mannequin builder, and a
  bounding-box outfit fitter. Covered by 25 of the backend suite's 65 tests
  (`test_jobs.py` 12, `test_mannequin.py` 7, `test_fitter.py` 6).
- Missing: **no frontend consumes it.** Body estimation and texture projection
  are deterministic stubs that record honestly what they did not do. There is no
  button, no polling loop, and no UI claim that this feature exists.

## 5. Planned / Not Implemented

The repository contains planning documents describing an ambitious product. This
section exists so none of it is mistaken for capability. Two distinct kinds:

### Planned — appears in roadmaps, not built
| Feature | State |
| --- | --- |
| ML/WASM cutout segmentation | Not implemented. The `CutoutDeps` and `assetBlobStore` seams are ready; no model exists. |
| Async avatar jobs — frontend | Not implemented, deliberately. Backend only. |
| Real body estimation / texture projection | Not implemented. Honest stubs. |
| Full-resolution image storage | Not implemented. Only the downscaled thumbnail is kept. |
| Mobile app | Not implemented. Assessment only — see [`MOBILE_MIGRATION.md`](MOBILE_MIGRATION.md). |
| 3D / React Three Fiber room | Not implemented. The studio is CSS. |

### Absent by design — never planned, and their absence is the architecture
| Feature | Why absent |
| --- | --- |
| Authentication, user accounts | Local-first by design. There is no server holding wardrobe data to authenticate against. |
| Cloud sync, multi-device | Same. Storage is the browser. |
| Text search | Filtering is category + tag. No search input exists anywhere in the UI. |
| Sorting controls, favourites, seasons | Never built, never planned. |
| Notifications, analytics, telemetry | None. The app phones home to nothing. |
| User profile | No user concept exists. |
| AI / personalised / learned recommendations | Not implemented, and forbidden as a claim — `src/test/honesty.ts` fails the build if this wording reaches UI copy. Note what *does* exist: the Fit Check and `silhouetteHint` emit **deterministic, rule-based** guidance ("Add shoes to ground the look", "Torso layer open"). Nothing is learned, personalised, or model-driven. |
| Social features, sharing | None. |
| Real virtual try-on, cloth simulation, accurate sizing | Not implemented. The mannequin is a 2.5D layered composition. |

## 6. Validation

Run on **Node 24.19.0** (also verified on 25.8.0 and 26.7.0) and **Python
3.12.13**.

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci` | **PASS** |
| Typecheck | `npm run typecheck` | **PASS** — covers `src/` *and* the `api/` Edge functions (two tsconfigs) |
| Lint | `npm run lint` | **PASS** |
| Unit / component tests | `npm test` | **PASS** — 551 tests, 69 files |
| Build | `npm run build` | **PASS** — 283 kB main chunk; 733 kB three.js in a separate lazy chunk |
| Backend tests | `python -m pytest backend` | **PASS** — 71 passed, 1 warning |
| Backend startup | `python -m uvicorn app.main:app --app-dir backend --port 8000` | **PASS** — "Application startup complete" |
| API smoke test | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/openapi.json` | **PASS** — HTTP 200, six routes; unknown job id correctly returns 404 |
| CI workflow | `.github/workflows/ci.yml` | **NOT VERIFIED remotely** — YAML parsed and both jobs replicated locally in a clean clone, but CI has never run because nothing has been pushed |
| Browser tests | `npm run test:e2e` | **PASS** — 12 (6 Playwright specs × desktop chromium + Pixel 7) |
| Mobile build | — | **NOT APPLICABLE** — a web application. There is no Swift, SwiftUI, React Native or other native mobile code anywhere in this repository. |

The single remaining backend warning is third-party (`StarletteDeprecationWarning`
about `httpx` in `starlette.testclient`), not this project's code.

## 7. Runtime / Deployment

**Deployment status: no deployment configuration, live URL, or deployment
evidence exists anywhere in the repository** — no Vercel/Docker/IaC config, no
deploy workflow, no environment URL. On that basis the project is treated as
never deployed and having no users. (Strictly, a repository cannot prove that no
one ever deployed it manually; that part is owner attestation.) Everything below
is local development.

| Runtime | How it runs | Serves |
| --- | --- | --- |
| Web app | `npm run dev` → `localhost:5173` | The whole product |
| Vercel Edge functions (`api/`) | **Not served by `npm run dev`.** Needs `vercel dev` or a deployment. | `analyze`, `product-meta`, `candidate-search` |
| FastAPI service (`backend/`) | `uvicorn` on `127.0.0.1:8000`; Vite proxies `/api` to it | `/api/proxy-3d/*`, `/api/jobs/*` |

No database server, no container, no cloud storage, no CDN, no external service
is contacted in the default configuration.

## 8. Data / Persistence

**Local-only, in the browser.** There is no server-side copy of a wardrobe.

- **Metadata** (garments, saved looks, current outfit) is JSON in **IndexedDB**,
  falling back to **localStorage**, falling back to **in-memory** when both are
  blocked. The facade probes with a timeout so a stalled `open()` cannot hang
  startup.
- **Image bytes** live apart from metadata. Records keep a downscaled thumbnail
  plus blob references; heavy cropped and cutout images sit as Blobs in a
  **second IndexedDB database**. A `put()` resolves only after its transaction
  commits, so a reference is never attached to a blob that did not land — and
  because a thumbnail is always present, a lost blob degrades the preview rather
  than losing the piece.
- **Proxy-3D previews** are metadata-only links (a job id + honest limitations
  text). The GLB itself stays in the local FastAPI service's job storage, so
  reopening one needs that service running.
- **Backend job output** is written to `backend/data/` (gitignored).

Clearing browser storage clears the archive, so **export a backup** — a
versioned JSON file with image bytes inlined, importable with a merge or replace
choice. That is the only recovery path, and the only way to move an archive to
another browser.

## 9. Known Issues

1. **No export or backup.** Combined with browser-only storage, a cleared
   profile means a lost archive. This is the most user-visible gap.
2. **The optional cloud paths are unverified end to end.** Implemented and
   unit-tested, but never demonstrated against the live Anthropic or eBay APIs.
3. **A missing blob degrades silently.** By design the preview falls back to the
   thumbnail, but nothing tells the user the higher-quality asset is gone.
4. **Cutout quality varies sharply with the photo.** A flood fill works well on
   clean flat-lay backgrounds and poorly on busy ones. The flow is honest about
   this and skippable, but it is a real limitation.
5. **Persistence is fire-and-forget.** A failed save is silent app-wide.
6. **The default page fetches Google Fonts.** It is the one external request the
   app makes with no configuration — typefaces only, no wardrobe data, no photo,
   no identifier the app supplies. It still means the default experience is not
   strictly zero-network, and it fails to a system-serif fallback offline.

## 10. Technical Debt

Ordered by what actually costs something.

1. **The optional serverless routes are unauthenticated and send
   `Access-Control-Allow-Origin: *`.** `api/analyze.ts`, `api/product-meta.ts`
   and `api/candidate-search.ts` have no auth, no rate limit and no request-size
   cap, while `analyze` spends `ANTHROPIC_API_KEY` and `candidate-search` spends
   eBay credentials per call. **This is a deployment risk, not a leak** — keys
   are server-only and the app is inert with the env unset. A written fix
   (origin allowlist, token cache, per-caller throttle) is stranded on the
   unmerged branch `thread/api-hardening`. **Do not deploy `api/` publicly with
   real keys until it is merged and reviewed.**
2. **`main` is stale and six `thread/*` branches are unmerged** —
   `api-hardening`, `docs-ci`, `ebay-mapping`, `json-export`, `price-domain`,
   `texture-projector`. From outside, only `main` is visible, so this work reads
   as absent.
3. **No `LICENSE`.** A public repository without one is legally "all rights
   reserved", which discourages the reading a portfolio wants. A legal choice,
   left to the owner.
4. **The test suite requires Node 22+.** Not debt so much as a stated floor:
   the jsdom storage fix relies on `--no-experimental-webstorage`, which Node 20
   and earlier reject outright. Verified on 24, 25 and 26.
5. **`backend/requirements.txt` has no upper bounds.** Every entry is a `>=`
   floor, so a fresh install resolves whatever is newest — verified: a clean
   install pulls trimesh **5.0.0** and FastAPI **0.141.1**, two majors past the
   checked-in virtualenv. The suite passes on both, but backend CI is not
   reproducible.
6. **The canvas/image path has no browser coverage.** The Playwright suite
   covers persistence, backup, multi-tab and the experimental boundary, but the
   upload flow's canvas work is still only exercised through stubs in jsdom.
   Driving a real file picker plus canvas decode is the brittle path that suite
   deliberately avoided; it remains the largest untested surface.
7. **`IMG_0198.jpg` remains in git history.** Removed from the working tree; a
   genuine purge needs `git filter-repo` and a force-push — an owner's decision.
   Recover with `git show 319b673:IMG_0198.jpg` if ever wanted.
8. **The `eval/cutout` harness is scaffolding.** Engines and a runner exist; the
   manifest holds one entry, no images are tracked and no results are committed.
   Excluded from lint and CI.
9. **The repository is misspelled `wadrobe`** (missing the `r`). Renaming it on
   GitHub is one click and GitHub redirects the old URL.

## 11. Next Recommended Work

1. **Merge `thread/api-hardening`, then triage the other five branches.** Closes
   the only debt item carrying financial exposure, and drags visible `main`
   forward past "push everything".
2. **Add archive export/import (JSON + images).** The largest real user risk is
   a cleared browser profile. Work already exists on `thread/json-export`.
3. **Add a small end-to-end suite** over the upload → archive → style → save
   loop, exercising the real canvas and IndexedDB paths that jsdom cannot.
4. **Add a `LICENSE`** and rename the repository to `wardrobe`.

## 12. Portfolio Readiness

| Check | State |
| --- | --- |
| README accuracy | Rewritten from the code; every claim traceable |
| Implemented vs planned separation | Explicit — [§3](#3-implemented), [§4](#4-partially-implemented), [§5](#5-planned--not-implemented) |
| Tests | 445 web + 65 backend, all passing |
| Lint | Passing |
| Typecheck | Passing, strict, covering `src/` and `api/` |
| Build | Passing |
| Secrets | None committed. `.env.example` is the only env file tracked, all values blank. History scanned clean. |
| Docs | One source of truth; historical plans quarantined in `docs/archive/` |
| Architecture | Documented and verified — [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Safe external claims | [`PORTFOLIO_FACTS.md`](PORTFOLIO_FACTS.md) is the only approved source |
| Deployment | **None.** Stated plainly rather than implied. |

**Verdict: ready with warnings.** The code and documentation are honest and
verifiable. The two things a reviewer will notice are that `main` does not show
this work and that there is no live demo.
