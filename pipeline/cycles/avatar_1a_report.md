# Cycle 1a — Promote cutout to mannequin/mirror/rack rendering

> ⚠️ 에이전트 자체 평가 — 자기평가 편향 가능, 사용자 재검토 필요.
> (Agent self-evaluation. Self-assessment bias is possible; user re-review needed.)

## Task (AVATAR_VISUAL_PLAN 1a)
The mannequin/mirror/rack showed background-included photos. Promote the existing
on-device cutout to those surfaces, additively, without touching the archive
card/lookbook or the backend.

## Location finding (no reimplementation)
The cutout logic is ALREADY a reusable lib — `src/lib/image/garmentCutout.ts`
(edge-seeded flood fill). `proxy3dCutout.ts` is only a Lab bridge over it. So 1a's
"extract to src/lib" was already satisfied; this cycle reuses the lib as-is (plus
one additive capability probe) and adds rendering + storage plumbing.

## What changed
- `garmentTypes.ts` — additive optional `asset.mannequinCutoutUrl`.
- `garmentAsset.ts` — `getGarmentMannequinImage` (prefers the mannequin cutout,
  else the normal display image) + `mannequinShowsCutout`. Pure, defensive.
- `MannequinPreview.tsx`, `ClothingRack.tsx` — render via the new helper;
  `isCutout` styling now covers a prepared mannequin cutout too. Mirror is covered
  transitively (it renders `MannequinPreview`).
- `ArchiveProvider.tsx` + `archiveContext.ts` — `prepareMannequinCutout(id)`:
  reuses the flood fill on demand, stores the cutout additively; honest fallback
  (unavailable/failed → keeps the original, no dispatch).
- `garmentCutout.ts` — additive `isLocalCutoutSupported()` probe (no algorithm
  change) so the no-canvas path (SSR/jsdom) skips instead of hanging on decode.
- `MirrorPreview.tsx` + CSS — an honest, opt-in "Remove photo backgrounds"
  control in the Mirror caption; copy owns the heuristic/quality-varies framing.
- Tests: helper + `mannequinShowsCutout` units; a decoupled-cutout mannequin
  render test; provider no-op/skip/honest-fallback tests. **446 tests green.**

## Backward compatibility
`parseGarments`/`sanitizeGarment` preserve the object and never touch `asset`;
`dehydrate` spreads `...asset`. So the additive data-URL field survives a full
persist/load round-trip with ZERO storage changes. Legacy items (no field) render
the original via the helper's fallback. (DECISIONS AV2/AV3/AV4.)

## Pipeline record
| Stage | Result |
|---|---|
| Gate #1 | RED once (a jsdom decode hang in a new provider test) → fixed at the source with the `isLocalCutoutSupported` probe → GREEN |
| Codex review #1 | **[major]** stale-snapshot: `prepareMannequinCutout` dispatched a garment snapshotted before the async cutout, clobbering a concurrent edit |
| Fix pass (1 of max 2) | re-read the latest garment from `garmentsRef.current` at resolution and merge onto it |
| Gate #2 | GREEN — 446 tests |
| Codex review #2 | **[blocker] none · [major] none · [minor] none** |

## Evidence (replaces the skipped 🚩 quality gate — AV1)
Ran the REAL `removeBackground` (imported, not reimplemented) on the actual shoe
photo (`IMG_0198.jpg`: black Vans on concrete). Verdict: **unavailable** — border
uniformity 0.526 < 0.82 gate, removedFraction 0. The heuristic honestly bails on a
textured background, so `evidence/1a-heuristic.png` is the unchanged photo. This is
correct behavior and the concrete motivation for 1b (ML). See `evidence/README.md`.

## Honesty
No FORBIDDEN_CLAIM_TERMS in the new copy; it keeps the "local background removal /
quality varies / keeps your original" framing. No real-3D/try-on/AI claims. Mock
default + zero network preserved; `backend/` untouched (1b will unfreeze it).

## Observation notes (draft — user to re-review)
- The stale-snapshot [major] is the SECOND time Codex caught this exact class
  (also pipeline-run-1 cycle 2). Async provider actions that snapshot-then-dispatch
  are a recurring trap; the `garmentsRef.current` re-read is the standard fix.
- The gate caught a real hang (jsdom decode) before any commit — gate authority held.
