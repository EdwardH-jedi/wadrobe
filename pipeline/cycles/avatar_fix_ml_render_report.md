# Diagnose+repair — ML cutout never reaches the mannequin/mirror render

> ⚠️ 에이전트 자체 평가 — 자기평가 편향 가능, 사용자 재검토 필요.

## Symptom
After "Remove photo backgrounds" in the Mirror, the shoe still shows the original
photo (light background). `evidence/1b-ml.png` is a clean cutout (0.714 removed),
so ML itself works — the result was not reaching render.

## Diagnosis (4 links; cause confirmed before any fix)
| Link | Check | Verdict |
|---|---|---|
| 1. env gate | `.env*` for the opt-in | **BROKEN** — only `.env.example` exists; `VITE_CUTOUT` unset → gate off |
| 2. request | how `mlCutout.ts` builds the URL | **BROKEN (root code bug)** — built an ABSOLUTE `${VITE_API_BASE}/api/cutout` and required `VITE_API_BASE`, bypassing the same-origin Vite proxy the project uses; the backend has no CORS → cross-origin fetch fails → silent heuristic fallback → 0.000 on this photo → "no change" |
| 3. store | `ArchiveProvider.tsx:318` | SOUND — writes `asset.mannequinCutoutUrl` (tested) |
| 4. render | `garmentAsset.ts:58` | SOUND — `getGarmentMannequinImage` reads it (tested) |

Evidence for link 2: `proxy3dApi.ts` calls a RELATIVE `/api/proxy-3d` and
`vite.config.ts` proxies `/api` → `127.0.0.1:8000` ("same-origin… no CORS
needed"). The ML client diverged from that convention — that divergence is the bug.

## Fix (only the broken link — request path in `mlCutout.ts`)
- Gate on `VITE_CUTOUT=ml` ALONE (drop the `VITE_API_BASE` requirement); this
  still keeps the default build network-free (gated on the opt-in flag).
- Call the RELATIVE `/api/cutout` (same-origin via the dev proxy), matching
  `proxy3dApi.ts`. `VITE_API_BASE` demoted to an OPTIONAL override (split deploy).
- Added `.env.local` (gitignored via `*.local`, NOT committed) with `VITE_CUTOUT=ml`
  so this working copy's dev build turns ML on. Corrected `.env.example` wording.
- **Did NOT touch** the store (#3) or render (#4) links, or the fallback chain.

## Regression tests (guard the reconnected link)
`mlCutout.test.ts`: `VITE_CUTOUT=ml` alone enables ML (the exact bug); the request
goes to the RELATIVE `/api/cutout` when no base is set; absolute base still works
as an optional override; env-off still makes zero network calls.

## Verification
- Frontend gate GREEN — **456 vitest** (typecheck/lint/build too).
- Backend gate GREEN — 68 pytest.
- **Live**: started uvicorn on :8000, `POST /api/cutout` with the shoe →
  `200 image/png`, RGBA transparent, 152 KB (== `evidence/1b-ml.png`). The dev
  Vite proxy forwards the frontend's relative `/api/cutout` to exactly this.

## Pipeline record
| Stage | Result |
|---|---|
| Gate #1 | GREEN (456 vitest) |
| Codex review | **[blocker]** stale module header still described the old AND-gate ("zero network unless both set") — a false guarantee vs the new code |
| Fix pass (1 of ≤1) | rewrote the header to the corrected gate (VITE_CUTOUT=ml only; same-origin /api) |
| Gate #2 | GREEN (456 vitest) |
