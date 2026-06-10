// Core garment domain types for The Archive.
// These types are persistence-agnostic and contain no UI concerns.

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
 * (the raw photo), `cropped` (Phase 9 manual crop), `cutout` (Phase 10 LOCAL,
 * experimental background removal — see `lib/image/garmentCutout.ts`), and
 * `product-reference` (a user-entered/local-demo reference image). There is still
 * **no** real product search/recognition, no cloud AI, and no 3D — the cutout is
 * a local, on-device edge flood fill whose quality varies with the photo.
 *
 * `displayImageUrl` is what every UI surface renders (always via
 * `getGarmentDisplayImage`); it holds the user's latest intentional choice in
 * lockstep with `assetMode`, so a stored cutout never shadows a chosen reference.
 * The remaining foundation work (higher-quality ML/WASM cutouts, 3D assets) is
 * not built.
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

/** Fields a user can edit on a garment (everything except identity/timestamps). */
export type GarmentDraft = Pick<
  GarmentItem,
  | 'name'
  | 'brand'
  | 'category'
  | 'color'
  | 'colorHex'
  | 'styleTags'
  | 'notes'
  | 'asset'
> & {
  imageDataUrl: string
}
