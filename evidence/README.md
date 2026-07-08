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

## 1b — ML background removal (rembg / U2Net)
`1b-ml.png` — added in step 1b, same input, for direct comparison.

## Regenerate
```
./pipeline/evidence/run.sh evidence/1a-input.png evidence/1a-heuristic.png
```
