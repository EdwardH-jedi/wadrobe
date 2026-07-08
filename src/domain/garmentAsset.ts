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

/**
 * What the MANNEQUIN / mirror / clothing-rack render for a garment (Avatar Visual
 * 1a). Prefers a prepared `mannequinCutoutUrl` (a local, background-removed
 * cutout) so those surfaces drop a flat-lay background; otherwise falls back to
 * the exact same source the rest of the app uses (`getGarmentDisplayImage`).
 *
 * This is deliberately SEPARATE from `getGarmentDisplayImage`: the archive card
 * and lookbook keep calling that one and are unaffected, so promoting a cutout to
 * the mannequin never changes the archive image. Defensive: a missing/malformed
 * `mannequinCutoutUrl` falls through to the normal display, so legacy items and
 * corrupt data always render something.
 */
export function getGarmentMannequinImage(garment: {
  asset?: GarmentAsset
  imageDataUrl: string
}): string {
  const url = garment.asset?.mannequinCutoutUrl
  if (typeof url === 'string' && url) return url
  return getGarmentDisplayImage(garment)
}

/** Whether a garment renders as a transparent cutout collage layer on the
 *  mannequin — either a prepared mannequin cutout (1a) or an accepted global
 *  cutout (Phase 10). Drives the matte-panel/blend drop + `contain` fit. */
export function mannequinShowsCutout(garment: { asset?: GarmentAsset }): boolean {
  const asset = garment.asset
  return (
    (typeof asset?.mannequinCutoutUrl === 'string' && !!asset.mannequinCutoutUrl) ||
    asset?.assetMode === 'cutout'
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
