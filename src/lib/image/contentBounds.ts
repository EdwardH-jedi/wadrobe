// Content-bounds analysis for transparent garment cutouts (revival Phase 2).
//
// A cutout is a rectangle of mostly-nothing with a garment somewhere inside it:
// a shoe photographed on a flat-lay leaves the shoe occupying maybe a third of
// the frame and transparent pixels everywhere else. Placing that rectangle into
// a body zone places the TRANSPARENT CANVAS into the zone, not the garment —
// which is exactly why the 2.5D preview reads as pasted-on rather than fitted.
//
// This module answers the question the renderer actually needs: where, inside
// the image, is the garment? Everything here is pure integer/float math over an
// RGBA buffer — no canvas, no DOM — so it is unit-testable against a hand-built
// `Uint8ClampedArray` and runs identically wherever it is called.
//
// It deliberately measures ALPHA only. An opaque flat-lay photo has no alpha
// channel to measure, and finding its subject would need a luminance/edge
// heuristic — a different and much less reliable problem. Opaque garments keep
// the honest matte-panel presentation instead.
//
// The RESULT type and its validator are domain data (they are persisted on the
// garment and validated by the storage parser), so they live in
// `domain/contentBounds.ts` and are re-exported here for callers that only care
// about the measurement.
import type { NormalizedContentBounds } from '../../domain/contentBounds'
import type { RasterImage } from './garmentCutout'

export type { NormalizedContentBounds }
export { isNormalizedContentBounds } from '../../domain/contentBounds'

/**
 * Alpha at or below this counts as background. Not zero: WebP is lossy, so a
 * pixel the flood fill set to 0 can come back as 1–3, and a strict `> 0` test
 * would measure the compression noise instead of the garment.
 */
export const DEFAULT_ALPHA_THRESHOLD = 8

/**
 * The smallest fraction of the frame a subject may occupy and still be trusted.
 * Below this the "garment" is almost certainly a speck of compression noise or
 * a stray anti-aliased corner, and fitting the preview to it would blow that
 * speck up to fill a body zone — far worse than not fitting at all.
 */
export const MIN_CONTENT_FRACTION = 0.002

/**
 * Measure the opaque content of an RGBA raster.
 *
 * Returns `null` — never throws, and never returns a nonsense box — when the
 * answer would not be trustworthy: malformed dimensions, a buffer that does not
 * match them, a fully transparent image, or a subject too small to be real. The
 * caller's contract is to fall back to the un-fitted presentation, so `null` is
 * an ordinary outcome rather than an error.
 *
 * A fully opaque image correctly yields the whole frame (`0,0,1,1`).
 */
export function computeContentBounds(
  raster: RasterImage,
  alphaThreshold: number = DEFAULT_ALPHA_THRESHOLD,
): NormalizedContentBounds | null {
  const { data, width, height } = raster

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  // A buffer that disagrees with the stated dimensions cannot be indexed
  // safely. Bail rather than read past the end or measure a partial image.
  if (!data || data.length < width * height * 4) return null

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3] <= alphaThreshold) continue
      // `minX`/`maxX` cannot be hoisted out of the row loop: the leftmost
      // opaque pixel of the image may live on any row.
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  // No pixel cleared the threshold — a fully transparent image.
  if (maxX < 0) return null

  // Bounds are INCLUSIVE pixel indices, so the span is +1: a subject occupying
  // only column 3 is one pixel wide, not zero.
  const boxWidth = maxX - minX + 1
  const boxHeight = maxY - minY + 1

  if ((boxWidth * boxHeight) / (width * height) < MIN_CONTENT_FRACTION) {
    return null
  }

  return {
    x: minX / width,
    y: minY / height,
    width: boxWidth / width,
    height: boxHeight / height,
    sourceAspect: width / height,
  }
}
