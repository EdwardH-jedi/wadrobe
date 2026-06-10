// Pure crop geometry — no canvas, no DOM, fully unit-testable (jsdom-safe).
//
// A CropRect is NORMALIZED to the source image: x/y/width/height ∈ [0, 1], where
// {x:0, y:0, width:1, height:1} is the whole image. The slider UI works in a
// friendlier {zoom, offsetX, offsetY} space; `cropRectFromControls` maps that to
// a normalized rect, and `cropRectToPixels` maps a rect onto actual image pixels
// for the canvas crop. Keeping all of this here means the browser code only has
// to call canvas APIs, never do geometry.

/** A normalized crop rectangle over the source image (all fields 0–1). */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** Friendly slider controls. zoom ≥ 1; offsets pan within the allowed range. */
export interface CropControls {
  /** 1 = whole image, larger = tighter crop. */
  zoom: number
  /** 0–1 horizontal pan position. */
  offsetX: number
  /** 0–1 vertical pan position. */
  offsetY: number
}

/** Maximum zoom the slider allows. */
export const MAX_CROP_ZOOM = 3
/** Smallest crop fraction we allow per edge (guards against a degenerate crop). */
export const MIN_CROP_FRACTION = 0.1

/** The no-op crop: the whole image. */
export const IDENTITY_CROP_RECT: CropRect = { x: 0, y: 0, width: 1, height: 1 }

/** The controls that correspond to no crop. */
export const IDENTITY_CROP_CONTROLS: CropControls = {
  zoom: 1,
  offsetX: 0.5,
  offsetY: 0.5,
}

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n))

/**
 * Map friendly slider controls to a normalized crop rect. A square fraction of
 * each dimension (1/zoom) keeps the source aspect; the offsets position that
 * window inside the remaining travel. Non-finite inputs collapse to the
 * identity crop so the UI can never produce NaN geometry.
 */
export function cropRectFromControls(controls: CropControls): CropRect {
  const zoom = Number.isFinite(controls.zoom)
    ? clamp(controls.zoom, 1, MAX_CROP_ZOOM)
    : 1
  const frac = clamp(1 / zoom, MIN_CROP_FRACTION, 1)
  const ox = Number.isFinite(controls.offsetX)
    ? clamp(controls.offsetX, 0, 1)
    : 0.5
  const oy = Number.isFinite(controls.offsetY)
    ? clamp(controls.offsetY, 0, 1)
    : 0.5
  const travel = 1 - frac
  return {
    x: ox * travel,
    y: oy * travel,
    width: frac,
    height: frac,
  }
}

/** True when the rect is finite, inside [0,1], and at least MIN_CROP_FRACTION. */
export function validateCropRect(rect: CropRect): boolean {
  const { x, y, width, height } = rect
  const finite = [x, y, width, height].every((n) => Number.isFinite(n))
  if (!finite) return false
  const eps = 1e-6
  return (
    x >= -eps &&
    y >= -eps &&
    width >= MIN_CROP_FRACTION - eps &&
    height >= MIN_CROP_FRACTION - eps &&
    x + width <= 1 + eps &&
    y + height <= 1 + eps
  )
}

/**
 * Clamp any rect into a valid one: finite, within [0,1], at least
 * MIN_CROP_FRACTION per edge, with x/y nudged so the box stays in bounds.
 */
export function clampCropRect(rect: CropRect): CropRect {
  const safe = (n: number, fallback: number): number =>
    Number.isFinite(n) ? n : fallback
  let width = clamp(safe(rect.width, 1), MIN_CROP_FRACTION, 1)
  let height = clamp(safe(rect.height, 1), MIN_CROP_FRACTION, 1)
  // Guard against width/height that were finite but still out of range.
  width = clamp(width, MIN_CROP_FRACTION, 1)
  height = clamp(height, MIN_CROP_FRACTION, 1)
  const x = clamp(safe(rect.x, 0), 0, 1 - width)
  const y = clamp(safe(rect.y, 0), 0, 1 - height)
  return { x, y, width, height }
}

/** Whether a rect is effectively the whole image (no real crop). */
export function isIdentityCrop(rect: CropRect, eps = 1e-3): boolean {
  return (
    Math.abs(rect.x) <= eps &&
    Math.abs(rect.y) <= eps &&
    Math.abs(rect.width - 1) <= eps &&
    Math.abs(rect.height - 1) <= eps
  )
}

/** Pixel source rectangle for a canvas crop (rounded, clamped to the image). */
export interface CropPixels {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * Map a normalized rect onto integer pixels of a `width`×`height` image. The
 * rect is clamped first, and the result is kept within the image bounds with a
 * minimum 1px size so the canvas draw can never be empty.
 */
export function cropRectToPixels(
  rect: CropRect,
  width: number,
  height: number,
): CropPixels {
  const r = clampCropRect(rect)
  const sx = clamp(Math.round(r.x * width), 0, Math.max(0, width - 1))
  const sy = clamp(Math.round(r.y * height), 0, Math.max(0, height - 1))
  const sw = clamp(Math.round(r.width * width), 1, width - sx)
  const sh = clamp(Math.round(r.height * height), 1, height - sy)
  return { sx, sy, sw, sh }
}
