// Where a garment sits inside its own image (revival Phase 2).
//
// This is DOMAIN data: it is persisted on `GarmentAsset`, it drives the
// mannequin's layout maths, and the storage parser validates it. The pixel
// measurement that PRODUCES it needs a canvas raster and therefore lives one
// layer up, in `lib/image/contentBounds.ts` — dependencies point downward, so
// the type lives here and the measurement imports it, never the reverse.
/**
 * The garment's bounding box within its image, as fractions of that image's own
 * width and height (all 0..1), plus the aspect of the image it was measured in.
 *
 * `sourceAspect` (width / height) is not redundant. The renderer places the
 * CONTENT box at a target size inside a body zone whose aspect differs from the
 * image's; without the source aspect it cannot convert a horizontal fraction
 * into a vertical one, and the placement collapses. Storing the single ratio
 * rather than both dimensions keeps the persisted record small and means a
 * re-encode at a different resolution does not invalidate it.
 */
export interface NormalizedContentBounds {
  x: number
  y: number
  width: number
  height: number
  sourceAspect: number
}

/**
 * Tolerant runtime check for a persisted value. Used by the storage parser and
 * by the renderer, so a hand-edited or truncated record degrades to the
 * un-fitted presentation instead of producing a garment positioned at `NaN%`.
 *
 * Rejects a zero-area box and one that runs outside its own image: both are
 * arithmetically valid and visually catastrophic.
 */
export function isNormalizedContentBounds(
  value: unknown,
): value is NormalizedContentBounds {
  if (typeof value !== 'object' || value === null) return false
  const b = value as Record<string, unknown>
  const finite = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v)

  if (!finite(b.x) || !finite(b.y) || !finite(b.width) || !finite(b.height)) {
    return false
  }
  if (!finite(b.sourceAspect) || b.sourceAspect <= 0) return false
  if (b.width <= 0 || b.height <= 0) return false
  if (b.x < 0 || b.y < 0) return false
  // A small epsilon absorbs float round-tripping through JSON; anything beyond
  // it is a genuinely out-of-frame box.
  if (b.x + b.width > 1.0001 || b.y + b.height > 1.0001) return false
  return true
}
