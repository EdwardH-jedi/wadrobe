# Skill: testing-harness

How testing and verification work here.

## Commands

```bash
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # eslint (flat config, eslint.config.js)
npm test            # vitest run
npm run build       # tsc --noEmit && vite build
```

Before claiming anything is done, run typecheck + test + build and report the
real output. Never assert success without evidence.

## Test setup

- Vitest, **jsdom** environment, `globals: false` (import `describe/it/expect`
  from `vitest`).
- `src/test/setup.ts` registers jest-dom matchers and **manual** RTL cleanup
  (`afterEach(cleanup)`) — required because globals are off.
- `src/test/factories.ts` has `makeGarment()`.

## What is covered

- `archiveReducer.test.ts` — outfit replacement by category, garment lifecycle,
  `sanitizeOutfit`, hydration.
- `fitCheck.test.ts` — empty/populated/neutral/editorial cases.
- `mockGarmentAnalysis.test.ts` — guess shape, keyword detection, determinism,
  no fabricated brand.
- `localStorageFallback.test.ts` — round-trips + corrupt-data resilience.
- `App.test.tsx` — full `<App/>` mount, hydration, navigation, upload modal.

Plus the provider (action creators, reload/persistence, delete-keeps-garments),
`uploadFlow` (state machine + copy honesty), `imageFileUtils` (decode validation
via a stubbed `Image`), and component behavior (mannequin zones, mirror caption,
saved cards, required-name). **100+ tests total.**

## Rules of thumb

- Keep the **reducer pure** and test it directly (no provider needed).
- Do **not** put the canvas/image path in unit tests — jsdom has no canvas.
  Tests exercise the localStorage backend (jsdom has no IndexedDB).
- When you add domain logic, add a pure unit test next to it.
- Strict TS: no unused locals/params, `noImplicitOverride`, etc. Fix types
  rather than casting to `any`.

## Manual QA

`docs/QA_CHECKLIST.md` is the manual pass. A headless screenshot sanity check:

```powershell
# with `npm run dev` running:
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --disable-gpu --no-sandbox --window-size=1480,920 `
  --virtual-time-budget=9000 --screenshot="$env:TEMP\shot.png" `
  "http://localhost:5173/"
```
