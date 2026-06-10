// Closet ↔ Proxy 3D bridge helpers (Track B3.9).
//
// - `previewFromRecord` turns a backend generation record into the small,
//   serializable metadata link stored on a garment (`GarmentProxy3dPreview`).
//   The GLB itself stays in the local backend's job storage.
// - `garmentImageToPngFile` converts a garment's display image (often a JPEG
//   thumbnail or transparent WebP cutout) into the PNG the proxy-3d backend
//   accepts. Canvas-based; returns null when conversion is impossible here
//   (e.g. jsdom) so callers can fall back to manual selection.
import type { GarmentProxy3dPreview } from '../../domain/garmentTypes'
import { loadImageElement } from '../../lib/image/imageFileUtils'
import type { Proxy3dRecord } from './proxy3dFlow'

export const PROXY3D_MODE_LABEL: Record<
  GarmentProxy3dPreview['mode'],
  string
> = {
  'flat-card': 'Flat image card fallback',
  'single-sided': 'Single-sided silhouette proxy',
  'dual-sided': 'Dual-sided silhouette proxy',
}

export function modeFromMethod(
  method: Proxy3dRecord['method'],
): GarmentProxy3dPreview['mode'] {
  switch (method) {
    case 'extruded-alpha-contour':
      return 'single-sided'
    case 'extruded-alpha-contour-dual':
      return 'dual-sided'
    case 'textured-plane':
      return 'flat-card'
  }
}

/** Build the garment-side metadata link from a backend record. */
export function previewFromRecord(
  record: Proxy3dRecord,
  generatedAt: number,
): GarmentProxy3dPreview {
  return {
    jobId: record.job_id,
    generatedAt,
    mode: modeFromMethod(record.method),
    method: record.method,
    frontAlphaMaskUsed: record.alpha_mask_used,
    backAlphaMaskUsed: record.back_alpha_mask_used ?? undefined,
    vertexCount: record.mesh.vertices,
    faceCount: record.mesh.faces,
    limitations: record.limitations,
  }
}

/**
 * Convert a garment's display image URL (data URL or object URL) into a PNG
 * File suitable for the proxy-3d backend. Alpha is preserved (a Track A
 * cutout WebP stays transparent). Returns null when the image cannot be
 * decoded or no canvas is available.
 */
export async function garmentImageToPngFile(
  imageUrl: string,
  fileName: string,
): Promise<File | null> {
  if (typeof document === 'undefined') return null
  let img: HTMLImageElement
  try {
    img = await loadImageElement(imageUrl)
  } catch {
    return null
  }
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!width || !height) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/png')
    } catch {
      resolve(null)
    }
  })
  if (!blob) return null
  return new File([blob], fileName, { type: 'image/png' })
}
