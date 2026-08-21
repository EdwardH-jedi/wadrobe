> **Historical document — not current implementation status.**
> Kept for the reasoning it records. It was accurate when written and has not
> been maintained since. For what the repository actually contains today, see
> [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md).

---

# The Archive

A local-first web app for archiving the clothes you own: photograph a piece, confirm a drafted classification, browse the resulting digital closet, and compose outfits on a faceless mannequin — built for one person cataloguing their own wardrobe, with no account, no server, and no data leaving the browser by default.

_(The draft included a screenshot placeholder here pointing at `docs/demo.png`, which was never created.)_

**Screen to capture here:** the **Mirror / Fit Preview** view with three or four garments layered on the mannequin and the Fit Check panel open. It is the payoff of the app's core loop (upload → archive → style → check) and the only screen that shows the domain model, the layered 2.5D composition, and the editorial UI in one frame. Second choice if you want to lead with technical range instead: the **Proxy 3D Lab** view showing a generated GLB in the viewer.

## Tech stack

The web app is Vite 6, React 18 and TypeScript in strict mode, styled with plain CSS custom properties (no CSS-in-JS, no utility framework) and tested with Vitest and Testing Library. React and three.js are the only runtime dependencies. Two optional, off-by-default extras sit alongside it: three Vercel Edge functions in `api/` that broker a vision model and an eBay product lookup, and a FastAPI service in `backend/` (Pillow, NumPy, trimesh, pygltflib) that turns a transparent PNG into a proxy 3D GLB.

## Architecture

The state layer is a **pure reducer** that receives every non-deterministic value — ids, timestamps, events — through its action payloads, so the whole domain is unit-testable without mocking clocks or crypto; the cost is that the provider's action creators carry that plumbing (`src/app/providers/archiveReducer.ts:1`).

**Persistence degrades instead of failing.** A facade probes IndexedDB, falls back to localStorage, and finally to an in-memory adapter that keeps the app usable when storage is blocked — silently non-persistent, which is the accepted trade-off. Writes are gated on a `hydrated` flag so the initial empty state can never overwrite stored data (`src/lib/storage/archiveStorage.ts:1`).

**Image bytes and metadata are stored separately.** Garment records keep a downscaled thumbnail plus blob references; the heavy cropped/cutout images live as Blobs in a second IndexedDB database. `put()` resolves only after the transaction commits, so a reference is never attached to a blob that did not land, and because a thumbnail is always present, a missing blob degrades the preview rather than losing the piece (`src/lib/storage/assetBlobStore.ts:1`).

**Network access is opt-in and AND-gated.** The analyzer only talks to a server when `VITE_API_BASE` *and* `VITE_ANALYZER=vision` are both set — configuring the API base for product lookup cannot silently enable per-upload vision — and any failure falls back to the local deterministic mock, so a misconfigured backend degrades rather than blocking an upload (`src/lib/ai/createAnalyzer.ts:47`). Sending a photo additionally requires a session-scoped consent gate stored in `sessionStorage`, which resets when the tab closes (`src/lib/ai/visionConsent.ts:1`).

**three.js is behind a single dynamic import** in the GLB viewer (`src/components/avatar/GlbViewer.tsx:42`). The production build confirms the split: a 283 kB main bundle, with the 733 kB three.js chunk loaded only when the Proxy 3D Lab is opened.

## Running locally

Requires **Node 20**. The test suite fails on newer Node — verified failing on v25.8.0 with `TypeError: localStorage.clear is not a function`, and passing on v20.20.2; versions in between were not tested. `package.json` has no `engines` field to enforce this.

```bash
npm install          # (unverified — node_modules was already present when this was checked)
npm run dev          # http://localhost:5173
npm test             # 433 tests across 55 files
npm run typecheck    # tsc --noEmit, strict
npm run lint         # eslint flat config
npm run build        # tsc --noEmit && vite build
```

Optional FastAPI backend (Track B, proxy 3D only — the web app does not require it):

```bash
cd backend
python -m venv .venv                                   # (unverified)
.venv/bin/python -m pip install -r requirements.txt     # (unverified)
.venv/bin/python -m pytest                              # 65 tests
.venv/bin/python -m uvicorn app.main:app --port 8000    # (unverified)
```

All commands above were run on Node 20.20.2 / Python 3.12 unless marked unverified. `backend/README.md` documents these steps with Windows PowerShell paths; the POSIX equivalents are shown here.

## Known limitations / next steps

The classification is a deterministic local mock by default — the optional vision path exists but is off unless two environment variables are set, and its result is always a draft the user confirms. The "3D" in the Proxy 3D Lab is an honest proxy: a textured, lightly extruded silhouette card built from a PNG's alpha channel, not garment reconstruction or virtual try-on. There is no CI, so nothing currently proves the 498 passing tests stay passing; and the optional serverless routes send `Access-Control-Allow-Origin: *` with no authentication or rate limiting, which needs fixing before any public deployment.
