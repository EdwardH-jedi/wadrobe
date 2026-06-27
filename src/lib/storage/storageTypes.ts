// Storage adapter contract + defensive parsers shared by every backend.
//
// The interface is intentionally a small key/value-ish surface: the store
// persists whole arrays (garments, saved outfits) plus the current outfit.
// Garment images are already downscaled thumbnails, so whole-array writes stay
// well within quota for realistic archive sizes.
import type {
  GarmentItem,
  GarmentProxy3dPreview,
} from '../../domain/garmentTypes'
import {
  OUTFIT_SLOT_ORDER,
  createEmptyOutfit,
  type OutfitSelection,
  type SavedOutfit,
} from '../../domain/outfitTypes'

export type StorageBackend = 'indexeddb' | 'localstorage' | 'memory'

/**
 * Outcome of a garments read. `ok` means the read SUCCEEDED (the archive may be
 * legitimately empty); `unavailable` means it failed/was corrupt and the result
 * is NOT a trustworthy view of the archive. The orphan sweep must only run on
 * `ok` — an `unavailable` empty list could otherwise be mistaken for "no
 * garments" and orphan-delete still-referenced blobs.
 */
export interface GarmentsReadResult {
  status: 'ok' | 'unavailable'
  garments: GarmentItem[]
}

export interface ArchiveStorageAdapter {
  readonly backend: StorageBackend
  loadGarments(): Promise<GarmentItem[]>
  /** Like `loadGarments` but distinguishes a real read failure from an empty
   *  archive (drives the orphan sweep's safety gate). */
  loadGarmentsResult(): Promise<GarmentsReadResult>
  saveGarments(items: GarmentItem[]): Promise<void>
  loadSavedOutfits(): Promise<SavedOutfit[]>
  saveSavedOutfits(items: SavedOutfit[]): Promise<void>
  loadCurrentOutfit(): Promise<OutfitSelection | null>
  saveCurrentOutfit(selection: OutfitSelection): Promise<void>
  clearAll(): Promise<void>
}

export const STORAGE_KEYS = {
  garments: 'fitarchive:garments',
  savedOutfits: 'fitarchive:savedOutfits',
  currentOutfit: 'fitarchive:currentOutfit',
} as const

// --- Defensive parsers ----------------------------------------------------
// Persisted data may be partial or corrupt (older versions, manual edits).
// Parsers never throw; they drop unrecognized entries and return safe values.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const CLOTHING_CATEGORIES = new Set([
  'outerwear',
  'top',
  'pants',
  'shoes',
  'accessory',
])

function isGarmentItem(value: unknown): value is GarmentItem {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.category === 'string' &&
    CLOTHING_CATEGORIES.has(value.category) &&
    typeof value.color === 'string' &&
    typeof value.colorHex === 'string' &&
    Array.isArray(value.styleTags) &&
    value.styleTags.every((tag) => typeof tag === 'string') &&
    typeof value.imageDataUrl === 'string' &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt)
  )
}

function isSavedOutfit(value: unknown): value is SavedOutfit {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isRecord(value.selection) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    typeof value.coverHex === 'string'
  )
}

const PROXY3D_MODES = new Set(['flat-card', 'single-sided', 'dual-sided'])

/** Tolerant validator for the optional Track B preview link (B3.9): a
 *  malformed value is dropped (the garment itself is kept). */
function isProxy3dPreview(value: unknown): value is GarmentProxy3dPreview {
  if (!isRecord(value)) return false
  return (
    typeof value.jobId === 'string' &&
    value.jobId.length > 0 &&
    typeof value.generatedAt === 'number' &&
    Number.isFinite(value.generatedAt) &&
    typeof value.mode === 'string' &&
    PROXY3D_MODES.has(value.mode) &&
    typeof value.method === 'string' &&
    typeof value.limitations === 'string'
  )
}

const ANALYSIS_SOURCES = new Set(['mock', 'vision-api'])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Drop an optional field from a clone if it is present but the wrong type, so a
 *  corrupt persisted value can never reach the UI. Allocates a clone lazily so
 *  the common (clean) path stays allocation-free. */
function sanitizeGarment(garment: GarmentItem): GarmentItem {
  let cleaned: GarmentItem | null = null
  const drop = <K extends keyof GarmentItem>(key: K) => {
    if (!cleaned) cleaned = { ...garment }
    delete cleaned[key]
  }

  if (
    garment.proxy3dPreview !== undefined &&
    !isProxy3dPreview(garment.proxy3dPreview)
  ) {
    drop('proxy3dPreview')
  }

  // Phase 1 purchase metadata + analysis provenance: keep only well-typed
  // values; drop anything malformed (older/hand-edited data) rather than throw.
  const strFields = [
    'material',
    'size',
    'currency',
    'subtype',
    'retailer',
  ] as const
  for (const key of strFields) {
    if (garment[key] !== undefined && typeof garment[key] !== 'string') {
      drop(key)
    }
  }
  if (garment.price !== undefined && !isFiniteNumber(garment.price)) {
    drop('price')
  }
  if (garment.purchasedAt !== undefined && !isFiniteNumber(garment.purchasedAt)) {
    drop('purchasedAt')
  }
  if (
    garment.analysisConfidence !== undefined &&
    !isFiniteNumber(garment.analysisConfidence)
  ) {
    drop('analysisConfidence')
  }
  if (
    garment.analysisSource !== undefined &&
    !(
      typeof garment.analysisSource === 'string' &&
      ANALYSIS_SOURCES.has(garment.analysisSource)
    )
  ) {
    drop('analysisSource')
  }
  if (
    garment.userEdited !== undefined &&
    typeof garment.userEdited !== 'boolean'
  ) {
    drop('userEdited')
  }

  return cleaned ?? garment
}

export function parseGarments(raw: unknown): GarmentItem[] {
  return Array.isArray(raw) ? raw.filter(isGarmentItem).map(sanitizeGarment) : []
}

export function parseSavedOutfits(raw: unknown): SavedOutfit[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isSavedOutfit).map((outfit) => ({
    ...outfit,
    selection: parseCurrentOutfit(outfit.selection) ?? createEmptyOutfit(),
  }))
}

export function parseCurrentOutfit(raw: unknown): OutfitSelection | null {
  if (!isRecord(raw)) return null
  const result = createEmptyOutfit()
  for (const slot of OUTFIT_SLOT_ORDER) {
    const value = raw[slot]
    result[slot] = typeof value === 'string' ? value : null
  }
  return result
}
