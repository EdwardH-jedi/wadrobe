// Storage adapter contract + defensive parsers shared by every backend.
//
// The interface is intentionally a small key/value-ish surface: the store
// persists whole arrays (garments, saved outfits) plus the current outfit.
// Garment images are already downscaled thumbnails, so whole-array writes stay
// well within quota for realistic archive sizes.
import type {
  GarmentItem,
  GarmentProxy3dPreview,
  MarketValueEntry,
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
  /**
   * Stored entries that were present but not readable as a garment, and were
   * therefore dropped.
   *
   * This number has to travel: the app re-persists the WHOLE array on the next
   * edit, so a record dropped at load is erased for good a moment later. Silent
   * is the one thing that must not happen — the user needs the chance to import
   * a backup before their next change makes the loss permanent.
   */
  unreadable: number
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
  /** Monotonic archive revision, for multi-tab write safety. A store that has
   *  never been written by a revision-aware tab reads as 0. */
  loadRevision(): Promise<number>
  saveRevision(revision: number): Promise<void>
  clearAll(): Promise<void>
}

export const STORAGE_KEYS = {
  garments: 'fitarchive:garments',
  savedOutfits: 'fitarchive:savedOutfits',
  currentOutfit: 'fitarchive:currentOutfit',
  revision: 'fitarchive:revision',
} as const

/** Parse a stored revision defensively; anything unusable means "unversioned". */
export function parseRevision(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

// --- Defensive parsers ----------------------------------------------------
// Persisted data may be partial or corrupt (older versions, manual edits).
// Parsers never throw; they drop unrecognized entries and return safe values.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * `isRecord`, minus arrays.
 *
 * `typeof [] === 'object'`, so `isRecord` accepts a JSON array wherever a JSON
 * object is required. Harmless for a garment (an array has none of the required
 * fields, so it fails validation anyway) and NOT harmless for a saved outfit's
 * `selection`, which is only ever read by key: an array passed the shape check
 * and was then normalized to an empty selection, so a look silently lost
 * everything it was styling and nothing was reported.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value)
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
    isPlainObject(value.selection) &&
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

/** A well-formed manual market-value entry (Phase: market-value tracking). */
function isMarketValueEntry(value: unknown): value is MarketValueEntry {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    isFiniteNumber(value.at) &&
    isFiniteNumber(value.value) &&
    (value.currency === undefined || typeof value.currency === 'string')
  )
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

  // The image bundle must be a plain object. A non-object (or an array) is
  // dropped outright: the garment still renders from `imageDataUrl`, which is
  // required. Fields *inside* a well-shaped asset are left alone — the display
  // chain in `getGarmentDisplayImage` already ignores non-string urls.
  if (
    garment.asset !== undefined &&
    (!isRecord(garment.asset) || Array.isArray(garment.asset))
  ) {
    drop('asset')
  }

  // Phase 1 purchase metadata + analysis provenance: keep only well-typed
  // values; drop anything malformed (older/hand-edited data) rather than throw.
  const strFields = [
    'brand',
    'notes',
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

  // Manual market-value history: must be an array of well-formed entries. Drop
  // a non-array outright; otherwise filter out malformed entries (keeping the
  // valid ones) so a single bad record can't poison the whole history.
  if (garment.marketValueHistory !== undefined) {
    if (!Array.isArray(garment.marketValueHistory)) {
      drop('marketValueHistory')
    } else {
      const history = garment.marketValueHistory
      const valid = history.filter(isMarketValueEntry)
      if (valid.length !== history.length) {
        const target = cleaned ?? { ...garment }
        target.marketValueHistory = valid
        cleaned = target
      }
    }
  }

  return cleaned ?? garment
}

/**
 * Parse stored garments, reporting how many entries had to be discarded.
 *
 * A discarded entry is one missing a field the UI cannot render without (id,
 * name, category, colour, image, timestamps). Keeping it would break rendering;
 * dropping it quietly would lose it. So it is dropped and counted.
 */
export function parseGarmentsWithReport(raw: unknown): {
  garments: GarmentItem[]
  unreadable: number
} {
  if (!Array.isArray(raw)) {
    // A non-array where an array was stored is itself unreadable data, but
    // there is no per-entry count to give — report the array as one loss.
    return { garments: [], unreadable: raw == null ? 0 : 1 }
  }
  const kept = raw.filter(isGarmentItem)
  return {
    garments: kept.map(sanitizeGarment),
    unreadable: raw.length - kept.length,
  }
}

export function parseGarments(raw: unknown): GarmentItem[] {
  return parseGarmentsWithReport(raw).garments
}

export function parseSavedOutfits(raw: unknown): SavedOutfit[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isSavedOutfit).map((outfit) => ({
    ...outfit,
    selection: parseCurrentOutfit(outfit.selection) ?? createEmptyOutfit(),
  }))
}

export function parseCurrentOutfit(raw: unknown): OutfitSelection | null {
  // An array is not a selection; returning `null` is what lets the caller
  // report it rather than hand back a silently emptied rail.
  if (!isPlainObject(raw)) return null
  const result = createEmptyOutfit()
  for (const slot of OUTFIT_SLOT_ORDER) {
    const value = raw[slot]
    result[slot] = typeof value === 'string' ? value : null
  }
  return result
}
