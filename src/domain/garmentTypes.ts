// Core garment domain types for The Archive.
// These types are persistence-agnostic and contain no UI concerns.

import type { NormalizedContentBounds } from './contentBounds'

/** The five top-level clothing categories the archive understands. */
export type ClothingCategory =
  | 'outerwear'
  | 'top'
  | 'pants'
  | 'shoes'
  | 'accessory'

/** How a garment's display image was sourced. */
export type AssetMode = 'uploaded' | 'cropped' | 'cutout' | 'product-reference'

/**
 * Where a garment's metadata guess came from. Canonical home is the domain so
 * `GarmentItem` can record provenance without depending on `lib/ai` (which would
 * be an upward import). `lib/ai/garmentAnalysisTypes.ts` re-exports this. Only
 * `'mock'` is implemented today; `'vision-api'` is a reserved future slot.
 */
export type AnalysisSource = 'mock' | 'vision-api'

/**
 * A reference to image bytes held outside the metadata record (Phase 11). Today
 * only the IndexedDB-blob kind exists; the discriminant keeps it extensible (a
 * future `remote-url` / `data-url` kind could join without breaking callers).
 */
export type AssetImageRef = {
  kind: 'indexeddb-blob'
  /** Key into the asset blob store (`lib/storage/assetBlobStore.ts`). */
  key: string
  mimeType?: string
  byteSize?: number
}

/**
 * A garment's image asset bundle. All four `assetMode`s now exist: `uploaded`
 * (the raw photo), `cropped` (a manual crop), `cutout` (LOCAL, experimental
 * background removal — see `lib/image/garmentCutout.ts`), and
 * `product-reference` (a user-entered/local-demo reference image).
 *
 * Every mode here is produced **on-device**: the cutout is a local edge flood
 * fill whose quality varies with the photo, not ML segmentation, and the
 * reference match is a local demo, not real product recognition. The optional
 * cloud paths (vision metadata, product lookup) are env-gated and never write
 * to these image fields; the experimental proxy-3D preview is metadata-only and
 * lives on `GarmentItem.proxy3dPreview`, not in this asset bundle.
 *
 * `displayImageUrl` is what every UI surface renders (always via
 * `getGarmentDisplayImage`); it holds the user's latest intentional choice in
 * lockstep with `assetMode`, so a stored cutout never shadows a chosen reference.
 * Higher-quality ML/WASM cutouts are not built; the seams for them are in
 * `lib/image/garmentCutout.ts` and `lib/storage/assetBlobStore.ts`.
 */
export interface GarmentAsset {
  /** The user's uploaded photo (downscaled data URL). */
  originalImageUrl: string
  /** What surfaces render — the chosen source. */
  displayImageUrl: string
  thumbnailImageUrl?: string
  /**
   * Manual-crop output (Phase 9): a re-encoded JPEG focused on the garment. Set
   * when the user crops in the upload flow; `displayImageUrl` is pointed at it
   * and `assetMode` becomes `'cropped'`.
   */
  croppedImageUrl?: string
  /**
   * Phase 11 blob refs. When present, the heavy bytes live in the asset blob
   * store and the matching `*ImageUrl` string is dropped from persisted metadata
   * (resolved back to an object URL at hydration). Backwards compatible: garments
   * without refs keep their inline data URLs and are never transformed.
   */
  croppedImageRef?: AssetImageRef
  cutoutImageRef?: AssetImageRef
  /**
   * Local background-removal output (Phase 10): a transparent WebP from the
   * on-device edge flood fill (`lib/image/garmentCutout.ts`). Set only when the
   * user ACCEPTS a cutout; `displayImageUrl` is pointed at it and `assetMode`
   * becomes `'cutout'`. Experimental — quality varies with the photo background.
   */
  cutoutImageUrl?: string
  /**
   * Where the garment actually sits inside `cutoutImageUrl` (revival Phase 2).
   *
   * OPTIONAL and additive: measured once when the user ACCEPTS a cutout, and
   * absent on every legacy garment, every opaque photo, and every cutout
   * accepted before this existed — all of which keep rendering exactly as
   * before. It is metadata only (it owns no blob bytes), so it is deliberately
   * NOT part of `garmentBlobKeys`, for the same reason `proxy3dPreview` is not.
   *
   * It exists because a cutout is mostly transparent canvas: fitting the CANVAS
   * to a body zone fits the emptiness, not the clothes.
   */
  contentBounds?: NormalizedContentBounds
  /** A user-provided reference image URL (e.g. an image from a product page). */
  productReferenceImageUrl?: string
  /** A user-provided source link for the reference. */
  sourceUrl?: string
  /** Short human label, e.g. "Vintage racing jacket reference". */
  sourceLabel?: string
  assetMode: AssetMode
}

/**
 * Track B bridge (B3.9): the link from a garment to a generated proxy 3D
 * preview. Only the job id + honest metadata are persisted — the GLB itself
 * lives in the LOCAL backend's job storage (`backend/data/proxy_3d/`), so
 * reopening it requires that backend to be running and the result to still
 * exist. This is an experimental proxy 3D preview, NOT real try-on, garment
 * reconstruction, or fit estimation. Optional and parser-tolerant: legacy
 * records simply lack it.
 */
export interface GarmentProxy3dPreview {
  /** Job id in the local proxy-3d backend (`/api/proxy-3d/{jobId}`). */
  jobId: string
  /** Epoch milliseconds (consistent with createdAt/updatedAt). */
  generatedAt: number
  mode: 'flat-card' | 'single-sided' | 'dual-sided'
  /** Backend method string, e.g. "extruded-alpha-contour-dual". */
  method: string
  frontAlphaMaskUsed?: boolean
  backAlphaMaskUsed?: boolean
  vertexCount?: number
  faceCount?: number
  /** The backend's honest limitations text, shown verbatim when reopened. */
  limitations: string
}

/**
 * One manually-recorded market-value observation for a garment. The user types
 * an estimate of what the piece is worth *now*; the archive keeps a timestamped
 * history so the trend versus the original `price` can be shown. This is a
 * **manual estimate the user entered** — NOT live, fetched, or "market data".
 *
 * `value` is a plain number paired with `currency` (defaulting to the garment's
 * own `currency` when omitted), mirroring the `price`/`currency` convention.
 * `at` is epoch ms (consistent with `createdAt`/`updatedAt`).
 */
export interface MarketValueEntry {
  id: string
  /** Epoch milliseconds. */
  at: number
  value: number
  currency?: string
}

/**
 * A single archived garment ("Archive Piece").
 *
 * `imageDataUrl` always holds a *downscaled* thumbnail (see
 * `lib/image/imageFileUtils.ts`). We never store full-resolution images in the
 * browser to stay well within the localStorage quota. Heavier owned images
 * (cropped/cutout) of new uploads are kept in the IndexedDB asset blob store
 * (`lib/storage/assetBlobStore.ts`, Phase 11) via `croppedImageRef`/
 * `cutoutImageRef`, with data-URL fallback when durable storage is unavailable.
 * Full-resolution Blob storage (vs. the thumbnail) remains future work.
 */
export interface GarmentItem {
  id: string
  name: string
  brand?: string
  category: ClothingCategory
  /** Human-readable primary color label, e.g. "Charcoal". */
  color: string
  /** Hex swatch for the primary color, e.g. "#2b2b2e". */
  colorHex: string
  styleTags: string[]
  notes?: string
  /**
   * Real-world purchase metadata (Phase 1). All optional so legacy records and
   * the procedural seed set stay valid; the manual editor is the most accurate
   * source for these until URL prefill (Phase 3) lands. `price` is a plain
   * number paired with `currency` (e.g. 129, "USD"); `purchasedAt` is epoch ms.
   */
  material?: string
  size?: string
  price?: number
  currency?: string
  subtype?: string
  purchasedAt?: number
  retailer?: string
  /**
   * Provenance of the metadata (Phase 1). When a garment is archived from the
   * upload flow these record the demo analyzer's confidence/source; `userEdited`
   * becomes true once the user changes a suggested field (or edits the piece
   * later). Optional — legacy records and sample garments lack them.
   */
  analysisConfidence?: number
  analysisSource?: AnalysisSource
  userEdited?: boolean
  /**
   * Manual market-value history (append-only). Each entry is an estimate the
   * user typed of the piece's current worth; helpers in `domain/marketValue.ts`
   * derive the trend versus `price`. Optional and parser-tolerant — legacy
   * records and the sample set simply lack it.
   *
   * This is plain metadata that owns NO blob bytes, so it is intentionally NOT
   * part of `garmentBlobKeys` (which tracks only IndexedDB blob refs). It is
   * also intentionally absent from `GarmentDraft`: it is appended via the
   * provider's `recordMarketValue`, never edited through the draft form, so a
   * normal `updateGarment` ({...existing, ...draft}) preserves it.
   */
  marketValueHistory?: MarketValueEntry[]
  /**
   * Downscaled thumbnail data URL. Kept for backward compatibility and as the
   * ultimate display fallback; prefer `asset.displayImageUrl` via
   * `getGarmentDisplayImage`.
   */
  imageDataUrl: string
  /**
   * Image asset bundle (display image + optional product reference). **Optional**
   * so pre-Phase-8 garments (which only have `imageDataUrl`) still render.
   */
  asset?: GarmentAsset
  /**
   * Link to a generated proxy 3D preview (Track B bridge, B3.9). Optional —
   * legacy garments and garments without a generated preview lack it. Holds
   * metadata only, never binary data; intentionally NOT part of
   * `garmentBlobKeys` (no blob-store bytes are owned by this field).
   */
  proxy3dPreview?: GarmentProxy3dPreview
  /** Epoch milliseconds. */
  createdAt: number
  /** Epoch milliseconds. */
  updatedAt: number
}

/** Fields a user can edit on a garment (everything except identity/timestamps
 *  and system-set analysis provenance). */
export type GarmentDraft = Pick<
  GarmentItem,
  | 'name'
  | 'brand'
  | 'category'
  | 'color'
  | 'colorHex'
  | 'styleTags'
  | 'notes'
  | 'material'
  | 'size'
  | 'price'
  | 'currency'
  | 'subtype'
  | 'purchasedAt'
  | 'retailer'
  | 'asset'
> & {
  imageDataUrl: string
}
