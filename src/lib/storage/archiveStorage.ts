// Storage facade: picks the best available backend and hands the rest of the
// app a single `ArchiveStorageAdapter`. Selection order:
//   1. IndexedDB  (durable, large capacity) — only if a live probe succeeds
//   2. localStorage (fallback, ~5 MB)
//   3. in-memory  (last resort; non-persistent, keeps the app functional)
import type { GarmentItem } from '../../domain/garmentTypes'
import type { OutfitSelection, SavedOutfit } from '../../domain/outfitTypes'
import {
  createLocalStorageAdapter,
  isLocalStorageUsable,
} from './localStorageFallback'
import { tryCreateIndexedDbAdapter } from './indexedDbStorage'
import type { ArchiveStorageAdapter } from './storageTypes'

export type { ArchiveStorageAdapter } from './storageTypes'
export { STORAGE_KEYS } from './storageTypes'

/** Non-persistent adapter. Keeps the app working when no storage is available. */
export function createMemoryAdapter(): ArchiveStorageAdapter {
  let garments: GarmentItem[] = []
  let savedOutfits: SavedOutfit[] = []
  let currentOutfit: OutfitSelection | null = null
  let revision = 0
  return {
    backend: 'memory',
    async loadGarmentsResult() {
      return { status: 'ok' as const, garments }
    },
    async loadGarments() {
      return garments
    },
    async saveGarments(items) {
      garments = items
    },
    async loadSavedOutfits() {
      return savedOutfits
    },
    async saveSavedOutfits(items) {
      savedOutfits = items
    },
    async loadCurrentOutfit() {
      return currentOutfit
    },
    async saveCurrentOutfit(selection) {
      currentOutfit = selection
    },
    async loadRevision() {
      return revision
    },
    async saveRevision(next) {
      revision = next
    },
    async clearAll() {
      garments = []
      savedOutfits = []
      currentOutfit = null
      revision = 0
    },
  }
}

/** Resolve the best available storage adapter for this environment. */
export async function createArchiveStorage(): Promise<ArchiveStorageAdapter> {
  const idb = await tryCreateIndexedDbAdapter()
  if (idb) return idb
  if (isLocalStorageUsable()) return createLocalStorageAdapter()
  return createMemoryAdapter()
}

let cached: Promise<ArchiveStorageAdapter> | null = null

/** Memoized singleton accessor used by the provider. */
export function getArchiveStorage(): Promise<ArchiveStorageAdapter> {
  if (!cached) cached = createArchiveStorage()
  return cached
}
