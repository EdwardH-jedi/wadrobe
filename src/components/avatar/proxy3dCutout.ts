// Cutout-first bridge for the Proxy 3D Lab (Track B3.6).
//
// Reuses Track A's REAL local background remover — the edge-seeded flood fill
// in lib/image/garmentCutout.ts — through its injectable CutoutDeps seam,
// swapping only the encoder: the proxy-3D backend accepts PNG, so the cutout
// is encoded as a transparent PNG instead of Track A's quota-conscious WebP.
// Everything runs on-device; nothing is uploaded by the cutout step itself.
//
// Also provides the alpha probe that decides whether the lab should warn
// before generating: a pure PNG header check (no canvas; works everywhere)
// plus a canvas-based "is any pixel actually transparent" pass when the
// header says an alpha channel exists.
import {
  attemptGarmentCutout,
  defaultCutoutDeps,
  CUTOUT_REASONS,
  type CutoutDeps,
  type RasterImage,
} from '../../lib/image/garmentCutout'
import { dataUrlToBlob } from '../../lib/storage/garmentAssetStorage'

export type AlphaVerdict = 'usable' | 'none' | 'unknown'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Pure PNG header probe: does the file even DECLARE transparency?
 * - color type 4 (gray+alpha) or 6 (RGBA) -> true
 * - color types 0/2/3 -> true only if a tRNS chunk appears before IDAT
 * - unparseable -> null
 * Walks chunk headers only (lengths + types); never inflates pixel data.
 */
export function pngDeclaresTransparency(bytes: Uint8Array): boolean | null {
  if (bytes.length < 33) return null
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return null
  }
  const u32 = (o: number) =>
    (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]
  const type = (o: number) =>
    String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])

  if (type(12) !== 'IHDR') return null
  const colorType = bytes[25]
  if (colorType === 4 || colorType === 6) return true

  // No alpha channel — transparency only via a tRNS chunk before IDAT.
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = u32(offset) >>> 0
    const chunkType = type(offset + 4)
    if (chunkType === 'tRNS') return true
    if (chunkType === 'IDAT' || chunkType === 'IEND') return false
    offset += 12 + length
  }
  // Probe window ended before IDAT (huge header) — undecided.
  return null
}

async function fileToImageUrl(
  file: Blob,
): Promise<{ url: string; revoke: () => void }> {
  if (typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(file)
    return {
      url,
      revoke: () => {
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
      },
    }
  }
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
  return { url, revoke: () => {} }
}

/**
 * Decide whether the selected PNG has a usable (actually transparent) alpha.
 * 'none' gates the lab's cutout-first warning; 'unknown' falls back to the
 * pre-B3.6 behavior (generate directly; the backend stays authoritative).
 */
async function readHeadBytes(file: Blob, limit: number): Promise<Uint8Array> {
  const slice = file.slice(0, limit)
  if (typeof slice.arrayBuffer === 'function') {
    try {
      return new Uint8Array(await slice.arrayBuffer())
    } catch {
      // Fall through to FileReader (e.g. jsdom's partial Blob).
    }
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsArrayBuffer(slice)
  })
}

export async function detectUsableAlpha(file: Blob): Promise<AlphaVerdict> {
  let declared: boolean | null
  try {
    declared = pngDeclaresTransparency(await readHeadBytes(file, 64 * 1024))
  } catch {
    return 'unknown'
  }
  if (declared === false) return 'none'
  if (declared === null) return 'unknown'

  // Alpha is declared — check whether any pixel is actually transparent
  // (downscaled; we only need "is there any alpha below the opaque band").
  const { url, revoke } = await fileToImageUrl(file)
  try {
    const raster = await defaultCutoutDeps.rasterize(url, 96)
    if (!raster) return 'unknown' // no canvas here — backend decides
    const { data } = raster
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return 'usable'
    }
    return 'none'
  } catch {
    return 'unknown'
  } finally {
    revoke()
  }
}

export interface ProxyCutoutSuccess {
  status: 'success'
  /** Transparent PNG, ready to send to /api/proxy-3d. */
  blob: Blob
  /** Data URL of the same PNG for the before/after preview. */
  previewUrl: string
  warnings?: string[]
}

export type ProxyCutoutOutcome =
  | ProxyCutoutSuccess
  | { status: 'unavailable' | 'failed'; reason: string }

/** Track A's deps with the encoder swapped to PNG (alpha-true, backend-accepted). */
const pngCutoutDeps: CutoutDeps = {
  rasterize: defaultCutoutDeps.rasterize,
  encode(raster: RasterImage) {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = raster.width
    canvas.height = raster.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const imageData = ctx.createImageData(raster.width, raster.height)
    imageData.data.set(raster.data)
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  },
}

/**
 * Run the local flood-fill cutout on the selected file and return a
 * transparent PNG blob. Same honest contract as Track A: never throws;
 * `unavailable`/`failed` carry user-safe reasons.
 */
export async function runProxyCutout(file: Blob): Promise<ProxyCutoutOutcome> {
  const { url, revoke } = await fileToImageUrl(file)
  try {
    const result = await attemptGarmentCutout(url, pngCutoutDeps)
    if (result.status !== 'success') return result
    const blob = dataUrlToBlob(result.cutoutImageUrl)
    if (!blob) {
      return { status: 'failed', reason: CUTOUT_REASONS.encodeFailed }
    }
    return {
      status: 'success',
      blob,
      previewUrl: result.cutoutImageUrl,
      warnings: result.warnings,
    }
  } finally {
    revoke()
  }
}
