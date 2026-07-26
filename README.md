# The Archive — Fit Archive

A premium, interactive **fashion archive** web app. Upload photos of clothes you
own, archive them with a **local demo** classification (a draft metadata
suggestion) you confirm, browse your digital closet, style a tall faceless
mannequin, run a **Fit Check**, and save looks to an editorial board — all in a
dark editorial showroom UI, persisted locally in your browser.

> This is an MVP base, and it stays honest about what it does. The closet's
> styling preview is a **2.5D layered composition** — never real virtual try-on,
> cloth simulation, or accurate fit. The classifier is a deterministic local mock
> by default; an optional, env-gated vision provider exists and stays off unless
> an operator configures it. A separate, optional **Track B** backend generates
> **proxy 3D** GLBs (a textured extruded silhouette, a procedural faceless
> mannequin, bounding-box outfit alignment) — an honest placeholder, not a body
> scan. See `docs/`.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

In an empty studio, click **Load sample** to populate a curated set and explore
the room, or **Upload** a clothing photo to archive your own piece.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck then build for production (`dist/`) |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (flat config) |
| `npm test` | Run the Vitest suite |

## Tech

Vite · React 18 · TypeScript (strict) · plain CSS design tokens · Vitest +
Testing Library. Runtime dependencies are `react`, `react-dom`, and `three` —
`three` is loaded **only** through a dynamic import inside the Proxy 3D Lab's
GLB viewer, so the closet app's bundle and startup are unaffected by it.

Two optional layers ship alongside, both **off by default**:

- `api/` — Vercel serverless functions (`product-meta`, `analyze`,
  `candidate-search`) reached only when `VITE_API_BASE` is configured (and, for
  vision, `VITE_ANALYZER=vision`). With the env unset the web app makes no
  network calls at all.
- `backend/` — a local-only FastAPI service (Track B) that turns a PNG into a
  proxy-3D GLB and exposes an async jobs API for proxy avatar composition. It is
  never contacted unless you run it yourself. See `backend/README.md`.

## Backend (optional, local only)

```bash
cd backend
python -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m pytest -q                       # test suite
.venv/bin/python -m uvicorn app.main:app --app-dir . --port 8000
```

The Vite dev server proxies `/api` to `127.0.0.1:8000`, so the Proxy 3D Lab view
finds it automatically once it is running.

## Documentation

- `CLAUDE.md` — vision, rules, and constraints (read first).
- `docs/PROJECT_SCOPE.md` — one-page scope: what is built, what is not.
- `docs/ARCHITECTURE.md` — components, domain models, storage, flows.
- `docs/ROADMAP.md` — delivered Track A phases + clearly-labeled future work.
- `docs/AVATAR_TRACK.md` — Track B (Avatar Lab): backend, proxy 3D, phase plan.
- `docs/AI_IMAGE_PIPELINE.md` — current mock + the optional vision provider.
- `docs/QA_CHECKLIST.md` — manual QA pass.
- `backend/README.md` — the Track B service's API, limits, and tests.
- `.claude/skills/` — short project-local guidance for Claude CLI sessions.

## Storage

Garments, saved looks, and the current outfit persist across reloads via a
storage adapter that prefers **IndexedDB**, falls back to **localStorage**, and
finally to **in-memory** (non-persistent) if both are blocked. Images are
downscaled to thumbnails before storage to stay within quota.

