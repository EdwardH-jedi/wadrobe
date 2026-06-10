// Browser crop generation (Phase 9). Canvas-backed; the geometry math lives in
// the pure `cropGeometry` module so this file only does decode + draw + encode.
//
// IMPORTANT: crop from the ALREADY-DOWNSCALED thumbnail (≤768px) and re-encode
// as JPEG so the cropped asset stays within the localStorage quota — never store
// a full-resolution or PNG crop. A decode failure propagates (the source is
// rejected upstream, never archived broken); if the canvas 2D context is
// unavailable (e.g. jsdom) we return the source image unchanged so the crop
// becomes a graceful no-op rather than a broken image.
import { loadImageElement, THUMBNAIL_QUALITY } from './imageFileUtils'
import {
  clampCropRect,
  cropRectToPixels,
  isIdentityCrop,
  type CropRect,
} from './cropGeometry'

/** Longest-edge cap for a generated crop (matches the thumbnail budget). */
export const CROP_MAX_EDGE = 768

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * Produce a cropped JPEG data URL from `imageUrl` and a normalized `cropRect`.
 * Returns the source unchanged for an identity (no-op) crop or when canvas is
 * unavailable. Throws only if the image cannot be decoded.
 */
export async function cropImageToDataUrl(
  imageUrl: string,
  cropRect: CropRect,
  maxEdge: number = CROP_MAX_EDGE,
  quality: number = THUMBNAIL_QUALITY,
): Promise<string> {
  const rect = clampCropRect(cropRect)
  // Decode first (OUTSIDE any try): a decode failure must propagate.
  const img = await loadImageElement(imageUrl)

  if (isIdentityCrop(rect)) return imageUrl

  try {
    const { sx, sy, sw, sh } = cropRectToPixels(rect, img.width, img.height)
    const scale = Math.min(1, maxEdge / Math.max(sw, sh))
    const outW = Math.max(1, Math.round(sw * scale))
    const outH = Math.max(1, Math.round(sh * scale))
    const canvas = createCanvas(outW, outH)
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return imageUrl // canvas absent: keep the valid source

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, outW, outH)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    // Canvas draw/encode failed (e.g. tainted) but the image decoded — keep it.
    return imageUrl
  }
}
