// Helpers for building and normalizing editable garment drafts.
import type { GarmentAsset, GarmentDraft, GarmentItem } from './garmentTypes'
import { COLOR_OPTIONS } from './garmentTaxonomy'

const DEFAULT_COLOR = COLOR_OPTIONS[1] // Charcoal

export function emptyGarmentDraft(imageDataUrl = ''): GarmentDraft {
  return {
    name: '',
    brand: undefined,
    category: 'top',
    color: DEFAULT_COLOR.name,
    colorHex: DEFAULT_COLOR.hex,
    styleTags: [],
    notes: undefined,
    imageDataUrl,
  }
}

export function garmentToDraft(garment: GarmentItem): GarmentDraft {
  return {
    name: garment.name,
    brand: garment.brand,
    category: garment.category,
    color: garment.color,
    colorHex: garment.colorHex,
    styleTags: [...garment.styleTags],
    notes: garment.notes,
    imageDataUrl: garment.imageDataUrl,
    asset: garment.asset,
  }
}

/**
 * A garment must be named before it can be archived/saved. The upload and edit
 * modals gate their confirm button on this; `normalizeDraft` still applies an
 * "Untitled Piece" fallback as a last-resort safety net, but the UI prevents a
 * blank name from reaching it.
 */
export function isNameMissing(name: string): boolean {
  return name.trim().length === 0
}

/** Trim/clean a draft just before it becomes a stored garment. */
export function normalizeDraft(draft: GarmentDraft): GarmentDraft {
  return {
    ...draft,
    name: draft.name.trim() || 'Untitled Piece',
    brand: draft.brand?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
    styleTags: Array.from(
      new Set(
        draft.styleTags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      ),
    ),
    asset: draft.asset
      ? normalizeAsset(draft.asset, draft.imageDataUrl)
      : undefined,
  }
}

/**
 * Clean a draft's asset just before it becomes a stored garment: trim string
 * fields (dropping blanks) and guarantee a non-empty display image.
 */
function normalizeAsset(
  asset: GarmentAsset,
  fallbackImage: string,
): GarmentAsset {
  const original = asset.originalImageUrl || fallbackImage
  return {
    ...asset,
    originalImageUrl: original,
    displayImageUrl: asset.displayImageUrl || original,
    productReferenceImageUrl: asset.productReferenceImageUrl?.trim() || undefined,
    sourceUrl: asset.sourceUrl?.trim() || undefined,
    sourceLabel: asset.sourceLabel?.trim() || undefined,
  }
}
