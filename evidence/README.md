# Cutout evidence — 1a heuristic vs 1b ML (same input)

Side-by-side comparison so the user can judge cutout quality after the fact
(replaces the skipped 🚩 1a quality gate — see DECISIONS AV1).

## Input
- `1a-input.png` — the real shoe photo (`IMG_0198.jpg`, black Vans OTW on a
  **concrete** background with a shoebox), downscaled to ≤640px (399×640) to
  match the cutout pipeline's `CUTOUT_MAX_EDGE`. This is the deliberate hard case.

## 1a — local heuristic (edge-seeded flood fill), run via the REAL code
`1a-heuristic.png` — produced by importing the shipping `removeBackground`
(`src/lib/image/garmentCutout.ts`), not a reimplementation.

| metric | value |
|---|---|
| sampled background (median border RGB) | (145, 140, 131) |
| border uniformity | **0.526** (needs ≥ 0.82 to proceed) |
| removed fraction | 0.000 |
| applied | **false** |
| verdict | **unavailable — border is not a uniform flat-lay** |

**Reading:** on this concrete background the heuristic honestly bails (the border
is only 53% uniform vs the 82% gate), so `1a-heuristic.png` is the unchanged photo
(alpha untouched). This is the correct, honest behavior — and it is precisely why
step 1b (ML background removal) exists: the flood fill is designed for plain
flat-lay backgrounds, not textured floors.

## 1b — ML background removal (rembg / U2Net), same input
`1b-ml.png` — produced by the real backend dependency (`rembg==2.0.59`,
`onnxruntime==1.20.1`, U2Net weights) on the identical 399×640 input.

| metric | value |
|---|---|
| removed fraction | **0.714** |
| kept fraction (the shoes) | 0.286 |
| output | RGBA, background cleanly transparent |

**Reading:** the ML model isolates the shoes from the concrete background (a minor
imperfection: it also keeps the hangtag). This is the decisive contrast — the same
photo where the 1a heuristic did nothing (0.000 removed, `unavailable`) is cleanly
cut by the ML path. **User judges 1a vs 1b here** (replaces the skipped 🚩 gate).

## Verdict summary (for the user's after-the-fact judgement)
| | 1a heuristic | 1b ML |
|---|---|---|
| removed fraction | 0.000 (bailed) | 0.714 |
| result on concrete bg | unchanged photo | clean shoe cutout |
| cost | on-device, instant, no deps | backend + 176MB model, env-gated |

## Regenerate
```
# 1a heuristic (bundles the real removeBackground):
./pipeline/evidence/run.sh evidence/1a-input.png evidence/1a-heuristic.png
# 1b ML (needs the backend venv with rembg installed):
backend/.venv/bin/python -c "from rembg import remove; \
  open('evidence/1b-ml.png','wb').write(remove(open('evidence/1a-input.png','rb').read()))"
```
