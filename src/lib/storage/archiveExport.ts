// Portable archive export — ONE self-contained JSON document.
//
// The document carries a schema version, every garment, every saved look and the
// current outfit, so an archive can leave the browser profile it was built in
// (backup today, migration to another client tomorrow). Nothing is uploaded:
// the file is produced locally and handed to the browser's download.
//
// ASSETS. Heavy garment images of new uploads live in the IndexedDB asset blob
// store as `croppedImageRef`/`cutoutImageRef` (Phase 11). A blob key only means
// something inside the profile that minted it, so the exporter RESOLVES each ref
// and inlines the bytes as a base64 data URL, then DROPS the ref. The result is
// shaped exactly like a legacy inline-data-URL garment, which every existing
// parser and display path already handles. Object URLs (`blob:…`, minted at
// hydration) are process-local and are never written out.
//
// MEMORY. The document is written incrementally through a `write(chunk)` sink,
// one garment at a time: each garment is inlined, serialized, and released
// before the next is touched. The archive's base64 bytes are therefore never
// held as a full object graph *and* a full JSON string at the same time.
import type {
  AssetImageRef,
  GarmentAsset,
  GarmentItem,
} from '../../domain/garmentTypes'
import type { OutfitSelection, SavedOutfit } from '../../domain/outfitTypes'
import type { AssetBlobStore } from './assetBlobStore'

/** Discriminator every export document carries, so an unrelated JSON file is
 *  rejected with a clear message instead of half-importing. */
export const ARCHIVE_EXPORT_KIND = 'fit-archive.archive'

/** Bumped only when the document shape changes in a way readers must know
 *  about. The importer refuses anything newer than it understands. */
export const ARCHIVE_EXPORT_SCHEMA_VERSION = 1

/** How image bytes travel in the document. Self-documenting for other readers
 *  (e.g. a future iOS importer): every image is an inline base64 data URL. */
export const ARCHIVE_EXPORT_ASSET_ENCODING = 'inline-data-url'

export interface ArchiveExportDocument {
  kind: typeof ARCHIVE_EXPORT_KIND
  schemaVersion: number
  assetEncoding: typeof ARCHIVE_EXPORT_ASSET_ENCODING
  /** Epoch milliseconds. */
  exportedAt: number
  garments: GarmentItem[]
  savedOutfits: SavedOutfit[]
  currentOutfit: OutfitSelection
}

/** The live archive state an export is built from. */
export interface ArchiveExportInput {
  garments: GarmentItem[]
  savedOutfits: SavedOutfit[]
  currentOutfit: OutfitSelection
}

/** An honest account of what the export contains — surfaced in the UI. */
export interface ArchiveExportStats {
  garmentCount: number
  savedOutfitCount: number
  /** Blob-backed images resolved out of the asset store and inlined. */
  inlinedImageCount: number
  /**
   * Blob refs that could not be read (store unavailable, blob missing, decode
   * failure). The piece is still exported — it falls back to its thumbnail —
   * but the count is reported rather than hidden.
   */
  unresolvedImageCount: number
}

export interface ArchiveExportDeps {
  /** Asset blob store used to resolve refs. Omit to export inline data only. */
  blobStore?: AssetBlobStore | null
  /** Epoch milliseconds stamped into the document (injectable for tests). */
  now?: number
  /** Blob → data URL conversion (injectable for tests). */
  blobToDataUrl?: (blob: Blob) => Promise<string>
}

// --- base64 ----------------------------------------------------------------

// btoa takes a binary string; converting a large buffer in one
// `String.fromCharCode(...bytes)` call would blow the argument limit.
const BASE64_CHUNK = 0x8000

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

/**
 * Encode a Blob as a base64 data URL — the inverse of
 * `garmentAssetStorage.dataUrlToBlob`. Uses `Blob.arrayBuffer()` where it
 * exists and falls back to `FileReader` (jsdom has the latter but not the
 * former). Both are standard browser APIs; no dependency, no network.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const mime = blob.type || 'application/octet-stream'
    return `data:${mime};base64,${bytesToBase64(bytes)}`
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('blob read failed'))
    reader.readAsDataURL(blob)
  })
}

// --- garment inlining -------------------------------------------------------

/**
 * A url that is meaningful outside this browser session, or undefined. Object
 * URLs (`blob:…`) are process-local handles minted at hydration — writing one
 * into a document would produce a file full of dead links.
 */
function exportableUrl(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return value.startsWith('blob:') ? undefined : value
}

interface ResolvedExportDeps {
  blobStore: AssetBlobStore | null
  blobToDataUrl: (blob: Blob) => Promise<string>
}

/**
 * Resolve a garment's blob-backed images into inline base64 and drop the refs.
 * Garments without an asset (pre-Phase-8) or without refs pass through with only
 * their url fields normalized.
 */
async function inlineGarmentForExport(
  garment: GarmentItem,
  deps: ResolvedExportDeps,
  stats: ArchiveExportStats,
): Promise<GarmentItem> {
  const asset = garment.asset
  if (!asset) return garment

  const resolve = async (
    ref: AssetImageRef | undefined,
    inline: string | undefined,
  ): Promise<string | undefined> => {
    if (ref?.kind !== 'indexeddb-blob' || !deps.blobStore) {
      return exportableUrl(inline)
    }
    let blob: Blob | null = null
    try {
      blob = await deps.blobStore.get(ref.key)
    } catch {
      blob = null
    }
    if (blob) {
      try {
        const dataUrl = await deps.blobToDataUrl(blob)
        stats.inlinedImageCount += 1
        return dataUrl
      } catch {
        /* fall through to the unresolved path */
      }
    }
    // Honest degradation: the piece still exports, with whatever inline image it
    // has (else its thumbnail via `displayImageUrl` below).
    stats.unresolvedImageCount += 1
    return exportableUrl(inline)
  }

  const croppedImageUrl = await resolve(asset.croppedImageRef, asset.croppedImageUrl)
  const cutoutImageUrl = await resolve(asset.cutoutImageRef, asset.cutoutImageUrl)
  const productReferenceImageUrl = exportableUrl(asset.productReferenceImageUrl)
  const fallback = garment.imageDataUrl

  // Mirrors `hydrateGarmentForRuntime`'s assetMode precedence, so what the file
  // shows is exactly what the user was looking at. Only used when the stored
  // `displayImageUrl` is unusable — i.e. blank (dehydrated) or an object URL
  // (hydrated); an intact data url is preserved as-is.
  const derived = (): string => {
    switch (asset.assetMode) {
      case 'product-reference':
        return productReferenceImageUrl || fallback
      case 'cutout':
        return cutoutImageUrl || fallback
      case 'cropped':
        return croppedImageUrl || fallback
      default:
        return fallback
    }
  }

  const exported: GarmentAsset = {
    ...asset,
    originalImageUrl: exportableUrl(asset.originalImageUrl) ?? fallback,
    displayImageUrl: exportableUrl(asset.displayImageUrl) ?? derived(),
    thumbnailImageUrl: exportableUrl(asset.thumbnailImageUrl),
    croppedImageUrl,
    cutoutImageUrl,
    productReferenceImageUrl,
  }
  // A blob key is only resolvable in the profile that minted it.
  delete exported.croppedImageRef
  delete exported.cutoutImageRef

  return { ...garment, asset: exported }
}

// --- writing ----------------------------------------------------------------

/**
 * Write the export document as a sequence of JSON chunks, one garment at a time.
 * `write` is called in document order; concatenating every chunk yields exactly
 * one valid `ArchiveExportDocument`.
 */
export async function writeArchiveExport(
  input: ArchiveExportInput,
  write: (chunk: string) => void,
  deps: ArchiveExportDeps = {},
): Promise<ArchiveExportStats> {
  const resolved: ResolvedExportDeps = {
    blobStore: deps.blobStore ?? null,
    blobToDataUrl: deps.blobToDataUrl ?? blobToDataUrl,
  }
  const stats: ArchiveExportStats = {
    garmentCount: 0,
    savedOutfitCount: input.savedOutfits.length,
    inlinedImageCount: 0,
    unresolvedImageCount: 0,
  }

  write(
    `{"kind":${JSON.stringify(ARCHIVE_EXPORT_KIND)},` +
      `"schemaVersion":${ARCHIVE_EXPORT_SCHEMA_VERSION},` +
      `"assetEncoding":${JSON.stringify(ARCHIVE_EXPORT_ASSET_ENCODING)},` +
      `"exportedAt":${deps.now ?? Date.now()},` +
      `"garments":[`,
  )
  for (let i = 0; i < input.garments.length; i += 1) {
    const inlined = await inlineGarmentForExport(input.garments[i], resolved, stats)
    // Serialized and dropped here, so only one inlined garment is ever live.
    write(i === 0 ? JSON.stringify(inlined) : `,${JSON.stringify(inlined)}`)
    stats.garmentCount += 1
  }
  write(
    `],"savedOutfits":${JSON.stringify(input.savedOutfits)},` +
      `"currentOutfit":${JSON.stringify(input.currentOutfit)}}`,
  )

  return stats
}

/**
 * Build the downloadable export file. The chunks are handed straight to the Blob
 * constructor, so the browser owns the bytes rather than a single giant string
 * living alongside the archive state.
 */
export async function buildArchiveExportBlob(
  input: ArchiveExportInput,
  deps: ArchiveExportDeps = {},
): Promise<{ blob: Blob; stats: ArchiveExportStats }> {
  const parts: string[] = []
  const stats = await writeArchiveExport(input, (chunk) => parts.push(chunk), deps)
  return { blob: new Blob(parts, { type: 'application/json' }), stats }
}

/** `the-archive-2026-07-27.json` — stable, sortable, obvious in a downloads folder. */
export function suggestArchiveExportFileName(now: number = Date.now()): string {
  const date = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `the-archive-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}.json`
}
