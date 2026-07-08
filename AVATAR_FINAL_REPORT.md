# AVATAR VISUAL — FINAL REPORT (steps 1a → 1b)

> Unattended run per the AVATAR_VISUAL_PLAN execution brief. Branch:
> `avatar-visual-1` (off `pipeline-run-1`; `pipeline-run-1` pushed to origin as a
> backup). `main` untouched. **No hard stop.** Every step run as a pipeline cycle
> under POLICY.md.

## Commits (this run)
| Commit | Step |
|---|---|
| `60ddc82` | **1a** — `feat(studio): promote cutout to mannequin/mirror rendering` |
| `5aaad7b` | **1b** — `feat(cutout): ML background removal behind env gate` |

Prereq: `pipeline-run-1` pushed to `origin` (backup); `avatar-visual-1` branched off it.

## Gate status (final)
- **Frontend:** typecheck ✅ · lint ✅ · **454 vitest** ✅ · build ✅ (Node 20).
- **Backend:** **68 pytest** ✅ (Python 3.12 venv; ML deps optional, happy-path
  test importorskips when rembg absent).

## Step 1a — cutout promoted to mannequin/mirror/rack
- Finding: cutout logic was ALREADY a reusable lib (`src/lib/image/garmentCutout.ts`);
  no extraction needed — reused as-is.
- Additive `asset.mannequinCutoutUrl` + `getGarmentMannequinImage` helper; mannequin/
  mirror/rack render the cutout when present, else the original (legacy-safe, no
  storage change — parser preserves `asset`). Archive card/lookbook untouched.
- `prepareMannequinCutout(id)` provider action (on-demand, honest fallback,
  concurrent-edit-safe via `garmentsRef`). Honest "Remove photo backgrounds"
  control in the Mirror caption.
- Report: `pipeline/cycles/avatar_1a_report.md`. Cycle: gate RED (jsdom hang) →
  fixed → GREEN; Codex [major] stale-snapshot → fixed → re-review clean.

## Step 1b — ML background removal behind an env gate
- Backend (unfrozen for this endpoint ONLY, per user AV0): `POST /api/cutout`
  (lazy rembg, typed errors, transparent PNG). ML deps pinned in optional
  `backend/requirements-ml.txt`. `tests/test_cutout.py`.
- Frontend: `mlCutout.ts` AND-gated client (`VITE_CUTOUT=ml` + `VITE_API_BASE`);
  **zero network when off (proven by test)**; fallback chain ML → heuristic →
  original; resolves `data:` and local `blob:` only (no remote fetch).
- Report: `pipeline/cycles/avatar_1b_report.md`.

## Evidence (side-by-side — replaces the skipped 🚩 quality gate, DECISIONS AV1)
Same input — real shoe photo on concrete (`IMG_0198.jpg` → `evidence/1a-input.png`, 399×640):
| file | result |
|---|---|
| `evidence/1a-heuristic.png` | heuristic **removed 0.000** — `unavailable` (border 0.526 < 0.82); unchanged photo |
| `evidence/1b-ml.png` | ML **removed 0.714** — clean shoe cutout on transparency |
`evidence/README.md` has the full verdict table. Regenerable via `pipeline/evidence/run.sh`.
**→ The user judges 1a vs 1b from these two images.**

## Codex review summary (incl. rebuttals)
- **1a:** [major] stale-snapshot in `prepareMannequinCutout` → **fixed** (re-read
  latest garment at resolution). Re-review clean (0/0/0).
- **1b:** [blocker] mandatory heavy deps → **fixed** (optional `requirements-ml.txt`).
  [major] ML source URL shape → **fixed** across 2 passes (accept `data:` + local
  `blob:`; never fetch remote). Two **[blocker]s rebutted (kept)** under a green
  gate + explicit user authorization: the `/api/cutout` backend endpoint and the
  runtime U2Net weight download are both authorized by **AV0** and the plan (which
  anticipates the download). See DECISIONS **AV5** + the 1b report.

## DECISIONS.md updates (reversible)
**AV0** backend unfrozen for the cutout endpoint only · **AV1** quality gate →
evidence · **AV2** item-level generation (additive field + studio control) ·
**AV3** cutout stored inline (not blob-backed) · **AV4** on-demand backfill only ·
**AV5** two 1b blockers rebutted under user authorization.

## Hard stop
**None.** All hard-stop conditions stayed clear: the cutout logic was located
(already a lib); `pip install` + the 176MB U2Net download succeeded; no gate
failed twice; backend pytest stayed green.

## For the user to decide next
1. Judge cutout quality from `evidence/1a-heuristic.png` vs `evidence/1b-ml.png`;
   confirm whether to keep 1b (ML) or ship 1a-only.
2. Ratify AV5 (the two rebutted 1b blockers) or ask to re-freeze the backend.
3. Whether to blob-back `mannequinCutoutUrl` (AV3) and auto-backfill existing
   items (AV4) before step 2 (foot-fit) and step 3 (3D).
4. Merge decision for `avatar-visual-1` (left to the user; `main` untouched).
