// Garment ⇄ storage asset bridge (Phase 11). Moves heavy garment image bytes
// into the asset blob store while keeping garment METADATA lightweight, and
// resolves them back for runtime display — WITHOUT changing the synchronous
// `getGarmentDisplayImage` contract or any UI.
//
// Backwards compatibility is the prime directive: these transforms are
// **ref-conditional**. A garment is only touched if it carries a blob ref
// (`croppedImageRef`/`cutoutImageRef`), which only the upload modal attaches and
// only when a DURABLE (IndexedDB) blob store is available. Legacy and Phase 8–10
// garments (data URLs, no refs) pass through unchanged — they persist and render
// exactly as before.
//
// Precedence is keyed off `assetMode` (never "first ref present"), so a stored
// cutout blob never shadows a chosen product-reference display.
import type {
  AssetImageRef,
  GarmentAsset,
  GarmentDraft,
  GarmentItem,
} from '../../domain/garmentTypes'
import { parseBlobCreatedAt, type AssetBlobStore } from './assetBlobStore'

/** A garment is blob-backed iff it owns at least one blob ref. */
export function isBlobBacked(asset?: GarmentAsset): boolean {
  return !!(asset && (asset.croppedImageRef || asset.cutoutImageRef))
}

/**
 * Lighten a blob-backed garment for storage (pure, sync). Drops the duplicate /
 * resolvable heavy strings (`originalImageUrl` == the thumbnail; `displayImageUrl`
 * is derived from `assetMode`; the cropped/cutout strings now live as blobs),
 * keeping the `imageDataUrl` thumbnail as the durable fallback. Non-blob-backed
 * garments are returned unchanged.
 */
export function dehydrateGarmentForStorage(garment: GarmentItem): GarmentItem {
  const asset = garment.asset
  if (!isBlobBacked(asset)) return garment
  const lean: GarmentAsset = {
    ...asset!,
    originalImageUrl: '', // == imageDataUrl (kept on the garment)
    displayImageUrl: '', // re-derived from assetMode at hydrate
    croppedImageUrl: asset!.croppedImageRef ? undefined : asset!.croppedImageUrl,
    cutoutImageUrl: asset!.cutoutImageRef ? undefined : asset!.cutoutImageUrl,
  }
  return { ...garment, asset: lean }
}

/**
 * Resolve a blob-backed garment for runtime display (async). Re-derives
 * `displayImageUrl` from `assetMode` — resolving the matching blob ref to an
 * object URL — and falls back to the matching inline asset, then the
 * `imageDataUrl` thumbnail, if the blob is missing (graceful degradation, never
 * a broken image). Only the DISPLAY source is resolved (one object URL per
 * garment); other refs stay unresolved.
 * Non-blob-backed garments are returned unchanged.
 */
export async function hydrateGarmentForRuntime(
  garment: GarmentItem,
  store: AssetBlobStore,
): Promise<GarmentItem> {
  const asset = garment.asset
  if (!isBlobBacked(asset)) return garment

  const resolve = async (ref?: AssetImageRef): Promise<string | null> =>
    ref?.kind === 'indexeddb-blob' ? store.getObjectUrl(ref.key) : null
  const fallback = garment.imageDataUrl

  let displayImageUrl: string
  switch (asset!.assetMode) {
    case 'product-reference':
      // A stored cutout ref must NOT shadow the chosen reference.
      displayImageUrl = asset!.productReferenceImageUrl || fallback
      break
    case 'cutout':
      displayImageUrl =
        (await resolve(asset!.cutoutImageRef)) || asset!.cutoutImageUrl || fallback
      break
    case 'cropped':
      displayImageUrl =
        (await resolve(asset!.croppedImageRef)) || asset!.croppedImageUrl || fallback
      break
    default: // 'uploaded'
      displayImageUrl = fallback
  }

  return {
    ...garment,
    asset: { ...asset!, originalImageUrl: fallback, displayImageUrl },
  }
}

/**
 * Blob keys a garment owns — the SINGLE source of truth for "what is referenced",
 * consumed by delete-cleanup AND the orphan sweep so they can never drift. Only
 * `indexeddb-blob` refs count: remote product-reference URLs and inline data URLs
 * are NOT blob keys. Any future blob ref field MUST be added here.
 */
export function garmentBlobKeys(garment: GarmentItem): string[] {
  const asset = garment.asset
  if (!asset) return []
  const keys = new Set<string>()
  const add = (ref?: AssetImageRef) => {
    if (
      ref?.kind === 'indexeddb-blob' &&
      typeof ref.key === 'string' &&
      ref.key.length > 0
    ) {
      keys.add(ref.key)
    }
  }
  add(asset.croppedImageRef)
  add(asset.cutoutImageRef)
  return [...keys]
}

/** Every blob key referenced by the archive, deduplicated. */
export function archiveBlobKeys(garments: GarmentItem[]): Set<string> {
  const keys = new Set<string>()
  for (const g of garments) {
    for (const k of garmentBlobKeys(g)) keys.add(k)
  }
  return keys
}

/** Default orphan-age threshold: a blob must be at least this old to be swept. */
export const DEFAULT_ORPHAN_MIN_AGE_MS = 60 * 60 * 1000 // 1 hour

/**
 * Conservative orphan-blob sweep (Phase 12, cross-tab-hardened in 12.5). Deletes
 * blobs in the store that are NOT referenced by any current garment — reclaiming
 * bytes left by a failed metadata save. Because the thumbnail is always kept, an
 * orphan is only wasted space, never a broken garment, so this is disk hygiene,
 * not data-loss prevention.
 *
 * Three keep-conditions, all biased toward UNDER-deletion (over-deletion would be
 * permanent loss of a user-selected crop/cutout):
 * 1. `candidateKeys` MUST be a snapshot taken before new uploads can write blobs,
 *    so this tab's in-flight upload is never a candidate.
 * 2. A referenced blob is never deleted (read live, fail-closed: a thrown read
 *    aborts the whole sweep).
 * 3. **Age gate (12.5):** a candidate is deleted only if it is OLDER than
 *    `minAgeMs`. A blob another tab wrote moments ago (whose garment metadata is
 *    not yet visible here) is recent → kept. A legacy key with no embedded
 *    timestamp is treated as unsafe → kept.
 *
 * Per-key delete failures are non-fatal. `now`/`minAgeMs` are injectable for
 * deterministic tests.
 */
export async function cleanupOrphanBlobs(
  store: AssetBlobStore,
  candidateKeys: string[],
  getReferencedKeys: () => Set<string>,
  options: { now?: number; minAgeMs?: number } = {},
): Promise<{ deleted: string[]; keptRecent: string[] }> {
  if (candidateKeys.length === 0) return { deleted: [], keptRecent: [] }

  let referenced: Set<string>
  try {
    referenced = getReferencedKeys()
  } catch {
    return { deleted: [], keptRecent: [] } // unsure what's in use → delete nothing
  }

  const now = options.now ?? Date.now()
  const minAgeMs = options.minAgeMs ?? DEFAULT_ORPHAN_MIN_AGE_MS
  const deleted: string[] = []
  const keptRecent: string[] = []

  for (const key of new Set(candidateKeys)) {
    if (referenced.has(key)) continue
    const createdAt = parseBlobCreatedAt(key)
    // No timestamp (legacy/unsafe) → keep. Younger than the threshold → keep
    // (it may be a sibling tab's just-written, not-yet-referenced blob).
    if (createdAt === undefined || now - createdAt < minAgeMs) {
      keptRecent.push(key)
      continue
    }
    try {
      await store.delete(key) // also revokes any cached object URL
      deleted.push(key)
    } catch {
      /* non-fatal — keep going */
    }
  }
  return { deleted, keptRecent }
}

/** Decode a data URL to a Blob (no `fetch`, so it works in any environment). */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const mime = match[1] || 'application/octet-stream'
  const isBase64 = match[2] === ';base64'
  const data = match[3]
  try {
    if (isBase64) {
      const bin = atob(data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new Blob([bytes], { type: mime })
    }
    return new Blob([decodeURIComponent(data)], { type: mime })
  } catch {
    return null
  }
}

/**
 * Store a record's heavy OWNED images (cropped, cutout) as blobs and attach refs
 * to it — only when the blob store is durable (IndexedDB). The data URL strings
 * are kept on the record so display works immediately (they are dropped from
 * metadata later by `dehydrateGarmentForStorage`). Any failure (no store,
 * decode/put error) silently leaves the field as a data URL — the caller always
 * succeeds. The uploaded thumbnail and product-reference URLs are intentionally
 * never blob-backed.
 *
 * Generic over anything carrying a `GarmentAsset`, so both a new upload's
 * `GarmentDraft` and an imported `GarmentItem` (whose images arrive inline as
 * base64) take the same path into the blob store.
 */
export async function blobBackAsset<T extends { asset?: GarmentAsset }>(
  record: T,
  store: AssetBlobStore,
): Promise<T> {
  if (!store.durable || !record.asset) return record
  const asset = { ...record.asset }

  const back = async (
    existing: AssetImageRef | undefined,
    dataUrl: string | undefined,
  ): Promise<AssetImageRef | undefined> => {
    if (existing) return existing
    if (!dataUrl || !dataUrl.startsWith('data:')) return undefined
    const blob = dataUrlToBlob(dataUrl)
    if (!blob) return undefined
    const key = await store.put(blob)
    return key
      ? { kind: 'indexeddb-blob', key, mimeType: blob.type, byteSize: blob.size }
      : undefined
  }

  const [croppedRef, cutoutRef] = await Promise.all([
    back(asset.croppedImageRef, asset.croppedImageUrl),
    back(asset.cutoutImageRef, asset.cutoutImageUrl),
  ])
  if (croppedRef) asset.croppedImageRef = croppedRef
  if (cutoutRef) asset.cutoutImageRef = cutoutRef
  return { ...record, asset }
}

/** `blobBackAsset` for a new upload's draft (the original Phase 11 caller). */
export function blobBackDraftAsset(
  draft: GarmentDraft,
  store: AssetBlobStore,
): Promise<GarmentDraft> {
  return blobBackAsset(draft, store)
}
