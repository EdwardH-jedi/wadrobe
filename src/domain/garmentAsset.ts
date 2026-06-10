// Garment image asset helpers — the single source of "which image renders".
import type { GarmentAsset } from './garmentTypes'

/**
 * What every UI surface renders for a garment. Defensive: tolerates a missing,
 * partial, or malformed `asset` (e.g. from older/hand-edited persisted data) and
 * always returns a usable string. Uses `||` (not `??`) so empty-string asset
 * fields fall through to the next source.
 *
 * Order: displayImageUrl → cutoutImageUrl → croppedImageUrl → originalImageUrl →
 * imageDataUrl.
 *
 * PRECEDENCE (Phase 10) — `displayImageUrl` is the single source of truth for
 * what renders: it ALWAYS holds the user's latest *intentional* display choice,
 * kept in lockstep with `assetMode` (`uploaded` → raw, `cropped` → the crop,
 * `cutout` → an *accepted* background-removed cutout, `product-reference` → a
 * user-picked reference image). A generated cutout is NEVER applied
 * automatically — it only becomes the display when the user accepts it (which
 * sets `displayImageUrl = cutoutImageUrl`, `assetMode = 'cutout'`). This is why
 * `displayImageUrl` ranks ABOVE `cutoutImageUrl`: it guarantees a stale or
 * unaccepted cutout can never silently override an explicit product-reference
 * (Phase 8) choice. Everything after `displayImageUrl` is a defensive fallback
 * for malformed/legacy records.
 */
export function getGarmentDisplayImage(garment: {
  asset?: GarmentAsset
  imageDataUrl: string
}): string {
  const asset = garment.asset
  // Only accept a non-empty STRING url; a missing/empty/wrong-typed field (from
  // older or hand-edited persisted data) falls through to the next source.
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  return (
    str(asset?.displayImageUrl) ||
    str(asset?.cutoutImageUrl) ||
    str(asset?.croppedImageUrl) ||
    str(asset?.originalImageUrl) ||
    garment.imageDataUrl
  )
}

/** The default asset for a freshly uploaded photo: display = the original. */
export function buildUploadedAsset(originalImageUrl: string): GarmentAsset {
  return {
    originalImageUrl,
    displayImageUrl: originalImageUrl,
    assetMode: 'uploaded',
  }
}
