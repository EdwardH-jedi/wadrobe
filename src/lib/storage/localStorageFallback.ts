// localStorage-backed storage adapter (the fallback when IndexedDB is absent
// or blocked). Whole arrays are JSON-serialized under stable keys.
import type { GarmentItem } from '../../domain/garmentTypes'
import type { OutfitSelection, SavedOutfit } from '../../domain/outfitTypes'
import {
  STORAGE_KEYS,
  parseCurrentOutfit,
  parseGarments,
  parseSavedOutfits,
  type ArchiveStorageAdapter,
  type GarmentsReadResult,
  parseRevision,
} from './storageTypes'

/** Probe whether localStorage can actually be written to (private mode blocks it). */
export function isLocalStorageUsable(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    const probe = '__fitarchive_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    // PROPAGATE. This used to be swallowed with a console.warn so the app kept
    // running — but the caller then had no way to know the archive had not been
    // stored, and told the user it was saved. The provider now catches this and
    // reports it (see app/providers/persistenceStatus.ts); the app still keeps
    // running, it just stops claiming a failed write succeeded.
    console.warn(`[archive] localStorage write failed for "${key}"`, error)
    throw error instanceof Error
      ? error
      : new Error(`localStorage write failed for "${key}"`)
  }
}

export function createLocalStorageAdapter(): ArchiveStorageAdapter {
  // Distinguish a genuine read (absent key = empty archive) from a failure
  // (getItem throws, or stored JSON is corrupt) — only `ok` may drive the sweep.
  async function loadGarmentsResult(): Promise<GarmentsReadResult> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.garments)
      if (raw === null) return { status: 'ok', garments: [] }
      return { status: 'ok', garments: parseGarments(JSON.parse(raw)) }
    } catch {
      return { status: 'unavailable', garments: [] }
    }
  }
  return {
    backend: 'localstorage',
    loadGarmentsResult,
    async loadGarments(): Promise<GarmentItem[]> {
      return (await loadGarmentsResult()).garments // single source of truth
    },
    async saveGarments(items: GarmentItem[]): Promise<void> {
      writeJson(STORAGE_KEYS.garments, items)
    },
    async loadSavedOutfits(): Promise<SavedOutfit[]> {
      return parseSavedOutfits(readJson(STORAGE_KEYS.savedOutfits))
    },
    async saveSavedOutfits(items: SavedOutfit[]): Promise<void> {
      writeJson(STORAGE_KEYS.savedOutfits, items)
    },
    async loadCurrentOutfit(): Promise<OutfitSelection | null> {
      return parseCurrentOutfit(readJson(STORAGE_KEYS.currentOutfit))
    },
    async saveCurrentOutfit(selection: OutfitSelection): Promise<void> {
      writeJson(STORAGE_KEYS.currentOutfit, selection)
    },
    async loadRevision(): Promise<number> {
      try {
        return parseRevision(localStorage.getItem(STORAGE_KEYS.revision))
      } catch {
        return 0
      }
    },
    async saveRevision(revision: number): Promise<void> {
      writeJson(STORAGE_KEYS.revision, revision)
    },
    async clearAll(): Promise<void> {
      try {
        localStorage.removeItem(STORAGE_KEYS.garments)
        localStorage.removeItem(STORAGE_KEYS.savedOutfits)
        localStorage.removeItem(STORAGE_KEYS.currentOutfit)
        localStorage.removeItem(STORAGE_KEYS.revision)
      } catch (error) {
        console.warn('[archive] localStorage clear failed', error)
      }
    },
  }
}
