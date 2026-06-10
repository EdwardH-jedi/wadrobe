// Storage adapter contract + defensive parsers shared by every backend.
//
// The interface is intentionally a small key/value-ish surface: the store
// persists whole arrays (garments, saved outfits) plus the current outfit.
// Garment images are already downscaled thumbnails, so whole-array writes stay
// well within quota for realistic archive sizes.
import type { GarmentItem } from '../../domain/garmentTypes'
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

export function parseGarments(raw: unknown): GarmentItem[] {
  return Array.isArray(raw) ? raw.filter(isGarmentItem) : []
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
