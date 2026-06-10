// Browser image helpers: validation, data-URL reading, downscaling and a
// cheap dominant-color sample.
//
// IMPORTANT: every garment image is downscaled to a thumbnail BEFORE it is
// stored. Full-resolution data URLs would blow the ~5 MB localStorage quota
// after a handful of photos. Downscaling here is what keeps persistence within
// budget for both the IndexedDB and localStorage backends.
//
// These functions use the canvas/FileReader APIs. The canvas re-encode path is
// not unit-tested (jsdom has no 2d context), but decode VALIDATION is: a decode
// failure now propagates (it is no longer swallowed), so a corrupt image-MIME
// file is rejected upstream instead of being archived as a broken image. They
// still degrade gracefully when the canvas context is absent but the image
// itself decoded.

/** Reject obviously-too-large source files before we even read them (15 MB). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

/** Longest-edge cap for stored thumbnails. */
export const THUMBNAIL_MAX_EDGE = 768

/** JPEG quality for stored thumbnails. */
export const THUMBNAIL_QUALITY = 0.72

export interface ProcessedImage {
  /** Downscaled thumbnail data URL, safe to persist. */
  dataUrl: string
  /** Dominant color sampled from the image, if canvas was available. */
  dominantColorHex?: string
}

export function isSupportedImage(file: File): boolean {
  return file.type.startsWith('image/')
}

export function isWithinSizeLimit(file: File): boolean {
  return file.size <= MAX_UPLOAD_BYTES
}

/** Read a File into a data URL via FileReader. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Decode a data URL / src into an HTMLImageElement. Rejects on decode failure
 * (so corrupt images are caught upstream rather than archived broken). Shared by
 * the downscale, dominant-color, and crop paths.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.src = src
  })
}

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * Downscale a data URL so its longest edge is at most `maxEdge`, re-encoding as
 * JPEG. Even small images are re-encoded so a dimensionally-small but
 * inefficient source file cannot bypass the persisted-thumbnail path. Returns
 * the original data URL unchanged only if canvas is unavailable.
 */
export async function downscaleDataUrl(
  dataUrl: string,
  maxEdge: number = THUMBNAIL_MAX_EDGE,
  quality: number = THUMBNAIL_QUALITY,
): Promise<string> {
  // Decode first, OUTSIDE the catch. A decode failure (corrupt or blocked
  // image) must propagate so the upload flow can reject the file — we never
  // fall back to the undecodable source. The catch below only covers the benign
  // case where the image decoded but the canvas re-encode is unavailable.
  const img = await loadImageElement(dataUrl)
  try {
    const longest = Math.max(img.width, img.height)
    const scale = Math.min(1, maxEdge / longest)
    const width = Math.round(img.width * scale)
    const height = Math.round(img.height * scale)
    const canvas = createCanvas(width, height)
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return dataUrl // canvas absent: image is valid, keep it

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    // Canvas re-encode failed (e.g. tainted), but the image already decoded.
    return dataUrl
  }
}

/**
 * Sample a representative dominant color, ignoring near-white pixels so the
 * white background of a flat-lay does not dominate. Returns undefined when
 * canvas is unavailable.
 */
export async function sampleDominantColorHex(
  dataUrl: string,
): Promise<string | undefined> {
  try {
    const img = await loadImageElement(dataUrl)
    const size = 24
    const canvas = createCanvas(size, size)
    const ctx = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !ctx) return undefined

    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    let r = 0
    let g = 0
    let b = 0
    let counted = 0
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]
      if (alpha < 32) continue
      const pr = data[i]
      const pg = data[i + 1]
      const pb = data[i + 2]
      // Skip near-white (background) and fully-transparent pixels.
      if (pr > 238 && pg > 238 && pb > 238) continue
      r += pr
      g += pg
      b += pb
      counted += 1
    }
    if (counted === 0) return undefined

    const toHex = (n: number) =>
      Math.round(n / counted)
        .toString(16)
        .padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  } catch {
    return undefined
  }
}

/** Full upload pipeline: read → downscale → sample dominant color. */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  const original = await readFileAsDataUrl(file)
  const dataUrl = await downscaleDataUrl(original)
  const dominantColorHex = await sampleDominantColorHex(dataUrl)
  return { dataUrl, dominantColorHex }
}
