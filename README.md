# The Archive — Fit Archive

A premium, interactive **fashion archive** web app. Upload photos of clothes you
own, archive them with a **local demo** classification (a draft metadata
suggestion) you confirm, browse your digital closet, style a tall faceless
mannequin, run a **Fit Check**, and save looks to an editorial board — all in a
dark editorial showroom UI, persisted locally in your browser.

> This is an MVP base. It is a convincing **2.5D** styling illusion, not real 3D
> virtual try-on, and it makes no real AI/Vision API calls yet (the classifier
> is a deterministic mock with a clean seam for a real provider). See `docs/`.

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
Testing Library. No backend, no runtime dependencies beyond React.

## Documentation

- `CLAUDE.md` — vision, rules, and constraints (read first).
- `docs/ARCHITECTURE.md` — components, domain models, storage, flows.
- `docs/ROADMAP.md` — delivered Phases 1–7 + clearly-labeled future work.
- `docs/AI_IMAGE_PIPELINE.md` — current mock + how to add a real Vision API.
- `docs/QA_CHECKLIST.md` — manual QA pass.
- `.claude/skills/` — short project-local guidance for Claude CLI sessions.

## Storage

Garments, saved looks, and the current outfit persist across reloads via a
storage adapter that prefers **IndexedDB**, falls back to **localStorage**, and
finally to **in-memory** (non-persistent) if both are blocked. Images are
downscaled to thumbnails before storage to stay within quota.

