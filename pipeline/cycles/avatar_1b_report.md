# Cycle 1b — ML background removal behind an env gate

> ⚠️ 에이전트 자체 평가 — 자기평가 편향 가능, 사용자 재검토 필요.
> (Agent self-evaluation. Self-assessment bias is possible; user re-review needed.)

## Task (AVATAR_VISUAL_PLAN 1b)
Upgrade the cutout with an ML remover (rembg/U2Net) on the FastAPI backend,
reached only behind an env gate, with a fallback chain ML → 1a heuristic →
original. Backend unfrozen for this endpoint only (DECISIONS AV0).

## Hard-stop gate (passed)
`rembg==2.0.59` + `onnxruntime==1.20.1` installed into `backend/.venv` (Python
3.12 — no 3.14 onnxruntime wheels). First `remove()` downloaded the U2Net weights
(176MB → `~/.u2net/`) successfully and returned an RGBA cutout. No hard stop.

## What changed
**Backend (unfrozen, cutout-only):**
- `app/main.py` — `POST /api/cutout`: lazy-imports rembg (so the rest of the
  backend/tests never need it), validates empty/oversized, returns a transparent
  PNG; typed `CutoutError` (413/422/503), never a 500.
- `requirements.txt` — pinned optional ML deps with an honest comment.
- `tests/test_cutout.py` — validation paths always run; the ML happy path uses
  `importorskip` so a backend without rembg stays green. **68 backend tests pass.**

**Frontend (env-gated, default stays local-only):**
- `mlCutout.ts` — `attemptMlCutout` + `mlCutoutEnabled`: AND-gate
  (`VITE_CUTOUT=ml` + `VITE_API_BASE`) mirroring the analyzer opt-in. Makes ZERO
  network calls when off. Honest copy; injectable fetch/decode seam.
- `garmentCutout.ts` — `CutoutSource` gains `'ml-backend'` (additive).
- `ArchiveProvider.tsx` — `prepareMannequinCutout` fallback chain: ML → local
  heuristic (canvas-gated) → original.
- `mlCutout.test.ts` — proves zero network when the gate is off, correct POST when
  on, and graceful failure. `.env.example` documents `VITE_CUTOUT`.
- **452 frontend tests pass.**

## Evidence (side-by-side, replaces the skipped 🚩 gate — AV1)
Same 399×640 concrete-background shoe input:
- `evidence/1a-heuristic.png` — heuristic **removed 0.000** (unavailable).
- `evidence/1b-ml.png` — ML **removed 0.714**, clean shoe cutout on transparency.
See `evidence/README.md` for the verdict table. Decisive contrast.

## Pipeline record
| Stage | Result |
|---|---|
| Backend gate | GREEN — 68 pytest (3 new) |
| Frontend Gate #1 | GREEN — 452 vitest (6 new) |
| Codex review #1 | 2×[blocker], 1×[major] |
| Fix pass 1 | split ML deps → `requirements-ml.txt`; ML accepts object-URL sources |
| Codex review #2 | 2×[blocker] (recurring), 1×[major] refined |
| Fix pass 2 | restrict the object-URL fetch to LOCAL `blob:` only (no remote fetch) |
| Frontend Gate #2 | GREEN — 454 vitest |

## Codex findings & adjudication
- **[blocker] `/api/cutout` endpoint under `backend/`** → **REBUTTED (kept).** The
  user explicitly unfroze `backend/` for exactly this endpoint (DECISIONS **AV0**);
  CLAUDE.md §0 says the freeze lifts by user decision, and "user instructions take
  precedence." Objective gate green → keep + rebut (run conflict rule).
- **[blocker] heavy ML deps mandatory in `requirements.txt`** → **FIXED** (moved to
  optional pinned `requirements-ml.txt`; base install stays lean).
- **[blocker] model-weight download at runtime = network dependency** → **REBUTTED
  (kept).** The plan explicitly anticipates the U2Net download ("첫 실행 시 모델
  가중치 다운로드가 있을 수 있음") and makes only its FAILURE a hard stop. It is a
  backend/operator step, not the frontend default (which stays zero-network, and
  is proven so by test). Authorized under AV0.
- **[major] ML only accepts `data:` URLs** → **FIXED** (fix 1: accept object URLs);
  **refined [major] remote fetch CORS/leak** → **FIXED** (fix 2: only local `blob:`
  URLs are fetched; remote images degrade to the local heuristic).

Policy note (POLICY.md): 2 fix passes used (the cap). The two recurring blockers
are recorded rebuttals under a green gate + explicit user authorization, not
re-fixed — consistent with "gate green ⇒ keep implementation + record rebuttal."

## Honesty / invariants
Default build makes zero network calls (proven by test). Copy says "background
removal / quality varies", never AI/try-on/3D/recognition/sizing. Mock analyzer
default untouched; only the cutout endpoint added to the backend (AV0 scope).
