// Local, on-device garment background removal (Phase 10).
//
// This is a REAL background remover — an edge-seeded flood fill that turns a
// uniform flat-lay background transparent. It is NOT machine-learning
// segmentation, NOT cloud AI, NOT product recognition, and NOT 3D try-on. It
// runs entirely in the browser on a canvas; nothing ever leaves the device. It
// works well on plain flat-lay backgrounds and honestly reports `unavailable`
// when the background is too busy, or `failed` when it cannot isolate a subject.
//
// The canvas work sits behind an injectable `CutoutDeps` adapter so that (a) the
// branch logic is unit-testable without a real browser canvas, and (b) a future
// ML segmentation model could replace the rasterize/segment step (e.g. via a
// dynamic import) without touching the UI or this result contract.
import type { NormalizedContentBounds } from '../../domain/contentBounds'
import { computeContentBounds } from './contentBounds'
import { loadImageElement } from './imageFileUtils'

/** How a successful cutout was produced. */
export type CutoutSource = 'local-flood-fill'

/** The result of attempting to produce a garment cutout. Never `success` unless
 *  a real transparent image was actually generated. */
export type CutoutResult =
  | {
      status: 'success'
      cutoutImageUrl: string
      maskImageUrl?: string
      warnings?: string[]
      source: CutoutSource
      /**
       * Where the garment sits inside the cutout (revival Phase 2), measured
       * from the raster this function already has in hand — no second canvas
       * pass. Optional: a subject too small or too faint to trust yields
       * `undefined`, and the caller falls back to the un-fitted presentation.
       */
      contentBounds?: NormalizedContentBounds
    }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string }

/** Honest, user-safe reason strings (guarded by the FORBIDDEN_CLAIM_TERMS test). */
export const CUTOUT_REASONS = {
  canvasUnavailable:
    'Local background removal needs an image canvas, which is not available here.',
  busyBackground:
    'Background removal was unavailable for this image — it works best on a plain, flat-lay background.',
  decodeFailed: 'This image could not be read for background removal.',
  noSubject: 'No clear garment could be separated from the background.',
  encodeFailed: 'The cutout preview could not be created.',
} as const

export const CUTOUT_WARNING_QUALITY =
  'Local preview only — cutout quality depends on the photo background.'

// --- Tunables ----------------------------------------------------------------
/** Longest edge the cutout is processed/stored at (quota-conscious). */
export const CUTOUT_MAX_EDGE = 640
/** RGB distance (squared compared) treated as "same as the background". */
const DEFAULT_TOLERANCE = 42
/** Fraction of the border that must match the sampled background to proceed. */
const BORDER_UNIFORMITY_MIN = 0.82
/** Below this removed fraction nothing meaningful was cut; above it the garment
 *  was likely eaten — either way we report `failed` rather than a bad cutout. */
const MIN_REMOVED_FRACTION = 0.05
const MAX_REMOVED_FRACTION = 0.92

export interface RasterImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface CutoutOptions {
  tolerance?: number
  uniformityMin?: number
  maxEdge?: number
}

/** The canvas seam. Swappable for tests or a future segmentation backend. */
export interface CutoutDeps {
  /** Decode + draw to an RGBA buffer (≤maxEdge). `null` = no canvas available. */
  rasterize(imageUrl: string, maxEdge: number): Promise<RasterImage | null>
  /** Encode an RGBA buffer to a transparent data URL. `null` = no canvas. */
  encode(raster: RasterImage): string | null
}

// --- Pure pixel math (no canvas; unit-testable) ------------------------------

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[s.length >> 1] ?? 0
}

/** Sample the border, returning the median background color and how uniform the
 *  border is (the fraction of border pixels close to that median). */
export function analyzeBorder(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number = DEFAULT_TOLERANCE,
): { bg: [number, number, number]; uniformity: number } {
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const pushAt = (x: number, y: number) => {
    const p = (y * width + x) * 4
    rs.push(data[p])
    gs.push(data[p + 1])
    bs.push(data[p + 2])
  }
  for (let x = 0; x < width; x++) {
    pushAt(x, 0)
    pushAt(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    pushAt(0, y)
    pushAt(width - 1, y)
  }
  const bg: [number, number, number] = [median(rs), median(gs), median(bs)]
  const tol2 = tolerance * tolerance
  let near = 0
  for (let i = 0; i < rs.length; i++) {
    const dr = rs[i] - bg[0]
    const dg = gs[i] - bg[1]
    const db = bs[i] - bg[2]
    if (dr * dr + dg * dg + db * db <= tol2) near++
  }
  return { bg, uniformity: rs.length ? near / rs.length : 0 }
}

/**
 * Edge-seeded flood fill: turn background-colored pixels CONNECTED to the border
 * transparent (alpha 0), leaving the garment — and any interior region matching
 * the background color (e.g. a white logo) — opaque. Mutates `data` in place.
 * Returns the fraction of pixels removed and whether it ran (it bails when the
 * border is not uniform enough to be a real flat-lay background).
 */
export function removeBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: CutoutOptions = {},
): { removedFraction: number; borderUniformity: number; applied: boolean } {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE
  const uniformityMin = options.uniformityMin ?? BORDER_UNIFORMITY_MIN
  const { bg, uniformity } = analyzeBorder(data, width, height, tolerance)
  if (uniformity < uniformityMin) {
    return { removedFraction: 0, borderUniformity: uniformity, applied: false }
  }

  const total = width * height
  const tol2 = tolerance * tolerance
  const matches = (idx: number): boolean => {
    const p = idx * 4
    const dr = data[p] - bg[0]
    const dg = data[p + 1] - bg[1]
    const db = data[p + 2] - bg[2]
    return dr * dr + dg * dg + db * db <= tol2
  }

  const visited = new Uint8Array(total)
  const stack = new Int32Array(total)
  let sp = 0
  const seed = (idx: number) => {
    if (!visited[idx] && matches(idx)) {
      visited[idx] = 1
      stack[sp++] = idx
    }
  }
  for (let x = 0; x < width; x++) {
    seed(x) // top row
    seed((height - 1) * width + x) // bottom row
  }
  for (let y = 0; y < height; y++) {
    seed(y * width) // left col
    seed(y * width + width - 1) // right col
  }

  let removed = 0
  while (sp > 0) {
    const idx = stack[--sp]
    data[idx * 4 + 3] = 0 // make transparent
    removed++
    const x = idx % width
    const y = (idx / width) | 0
    if (x > 0) seed(idx - 1)
    if (x < width - 1) seed(idx + 1)
    if (y > 0) seed(idx - width)
    if (y < height - 1) seed(idx + width)
  }

  return {
    removedFraction: total ? removed / total : 0,
    borderUniformity: uniformity,
    applied: true,
  }
}

/** Classify a removed fraction into the result the flow should show. */
export function classifyRemoval(
  removedFraction: number,
): 'success' | 'failed' {
  if (
    removedFraction < MIN_REMOVED_FRACTION ||
    removedFraction > MAX_REMOVED_FRACTION
  ) {
    return 'failed'
  }
  return 'success'
}

// --- Canvas-backed default adapter -------------------------------------------

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export const defaultCutoutDeps: CutoutDeps = {
  async rasterize(imageUrl, maxEdge) {
    const img = await loadImageElement(imageUrl) // rejects on decode failure
    const longest = Math.max(img.width, img.height) || 1
    const scale = Math.min(1, maxEdge / longest)
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = createCanvas(width, height)
    const ctx = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !ctx) return null
    ctx.drawImage(img, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    return { data, width, height }
  },
  encode(raster) {
    const canvas = createCanvas(raster.width, raster.height)
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return null
    const imageData = ctx.createImageData(raster.width, raster.height)
    imageData.data.set(raster.data)
    ctx.putImageData(imageData, 0, 0)
    // WebP preserves alpha at a fraction of PNG's size (quota-conscious). The
    // browser silently falls back to PNG if WebP is unsupported.
    return canvas.toDataURL('image/webp', 0.8)
  },
}

/**
 * Attempt a local garment cutout. Non-blocking by contract: it resolves with a
 * typed result and never throws into the caller — decode/canvas problems become
 * `failed`/`unavailable`, never a stuck flow.
 */
export async function attemptGarmentCutout(
  imageUrl: string,
  deps: CutoutDeps = defaultCutoutDeps,
  options: CutoutOptions = {},
): Promise<CutoutResult> {
  let raster: RasterImage | null
  try {
    raster = await deps.rasterize(imageUrl, options.maxEdge ?? CUTOUT_MAX_EDGE)
  } catch {
    return { status: 'failed', reason: CUTOUT_REASONS.decodeFailed }
  }
  if (!raster) {
    return { status: 'unavailable', reason: CUTOUT_REASONS.canvasUnavailable }
  }

  const { removedFraction, applied } = removeBackground(
    raster.data,
    raster.width,
    raster.height,
    options,
  )
  if (!applied) {
    return { status: 'unavailable', reason: CUTOUT_REASONS.busyBackground }
  }
  if (classifyRemoval(removedFraction) === 'failed') {
    return { status: 'failed', reason: CUTOUT_REASONS.noSubject }
  }

  let cutoutImageUrl: string | null
  try {
    cutoutImageUrl = deps.encode(raster)
  } catch {
    return { status: 'failed', reason: CUTOUT_REASONS.encodeFailed }
  }
  if (!cutoutImageUrl) {
    return { status: 'unavailable', reason: CUTOUT_REASONS.canvasUnavailable }
  }
  // Measured from the raster already in hand, AFTER the flood fill has written
  // its transparency and BEFORE it is handed back — so the bounds describe the
  // image the caller is about to store, at no extra canvas cost. `null` (a
  // subject too small or faint to trust) simply means no bounds are attached.
  const contentBounds = computeContentBounds(raster) ?? undefined

  return {
    status: 'success',
    cutoutImageUrl,
    source: 'local-flood-fill',
    warnings: [CUTOUT_WARNING_QUALITY],
    contentBounds,
  }
}
