// IndexedDB-backed storage adapter.
//
// Treated as a thin, durable key/value store (single object store, whole-array
// values). Every operation is wrapped so a failure degrades gracefully rather
// than crashing the app. The factory only selects this backend after a live
// read/write probe succeeds (see `archiveStorage.ts`), which catches the
// "IndexedDB present but blocked" case (private browsing, denied quota).
//
// This adapter persists METADATA only (whole arrays + the thumbnail). Heavy
// garment image bytes (cropped/cutout) of new uploads live in a SEPARATE
// IndexedDB asset blob store (`assetBlobStore.ts`, Phase 11), referenced from
// the metadata; this adapter's contract is unchanged. Phase 12 added conservative
// orphaned-blob cleanup outside this adapter. Future hardening (not new stores):
// atomic metadata+blob writes and a full-res storage strategy.
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

const DB_NAME = 'fit-archive'
const DB_VERSION = 1
const STORE = 'kv'

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('open failed'))
    request.onblocked = () => reject(new Error('open blocked'))
  })
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('request failed'))
  })
}

async function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  const tx = db.transaction(STORE, 'readonly')
  const value = await promisifyRequest(tx.objectStore(STORE).get(key))
  return value
}

function idbSet(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('write failed'))
    tx.onabort = () => reject(tx.error ?? new Error('write aborted'))
  })
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('clear failed'))
  })
}

/**
 * Create an IndexedDB adapter bound to an already-opened database. Reads return
 * safe defaults on error; writes warn but never throw.
 */
export function createIndexedDbAdapter(db: IDBDatabase): ArchiveStorageAdapter {
  async function safeGet(key: string): Promise<unknown> {
    try {
      return await idbGet(db, key)
    } catch (error) {
      console.warn(`[archive] IndexedDB read failed for "${key}"`, error)
      return null
    }
  }
  // Writes PROPAGATE: a swallowed write leaves the caller believing the archive
  // is stored when it is not. Reads stay tolerant (`safeGet`) because a missing
  // or corrupt key is a recoverable "empty archive", but a failed write is not
  // recoverable and the user has to be told. See persistenceStatus.ts.
  async function set(key: string, value: unknown): Promise<void> {
    try {
      await idbSet(db, key, value)
    } catch (error) {
      console.warn(`[archive] IndexedDB write failed for "${key}"`, error)
      throw error instanceof Error
        ? error
        : new Error(`IndexedDB write failed for "${key}"`)
    }
  }
  // A read that surfaces failure (vs the swallowing `safeGet`) so the orphan
  // sweep can tell "empty archive" apart from "couldn't read".
  async function loadGarmentsResult(): Promise<GarmentsReadResult> {
    try {
      return { status: 'ok', garments: parseGarments(await idbGet(db, STORAGE_KEYS.garments)) }
    } catch {
      return { status: 'unavailable', garments: [] }
    }
  }

  return {
    backend: 'indexeddb',
    loadGarmentsResult,
    async loadGarments(): Promise<GarmentItem[]> {
      return (await loadGarmentsResult()).garments // single source of truth
    },
    async saveGarments(items: GarmentItem[]): Promise<void> {
      await set(STORAGE_KEYS.garments, items)
    },
    async loadSavedOutfits(): Promise<SavedOutfit[]> {
      return parseSavedOutfits(await safeGet(STORAGE_KEYS.savedOutfits))
    },
    async saveSavedOutfits(items: SavedOutfit[]): Promise<void> {
      await set(STORAGE_KEYS.savedOutfits, items)
    },
    async loadCurrentOutfit(): Promise<OutfitSelection | null> {
      return parseCurrentOutfit(await safeGet(STORAGE_KEYS.currentOutfit))
    },
    async saveCurrentOutfit(selection: OutfitSelection): Promise<void> {
      await set(STORAGE_KEYS.currentOutfit, selection)
    },
    async loadRevision(): Promise<number> {
      return parseRevision(await safeGet(STORAGE_KEYS.revision))
    },
    async saveRevision(revision: number): Promise<void> {
      await set(STORAGE_KEYS.revision, revision)
    },
    async clearAll(): Promise<void> {
      try {
        await idbClear(db)
      } catch (error) {
        console.warn('[archive] IndexedDB clear failed', error)
      }
    },
  }
}

/** Probe IndexedDB with a real write/read roundtrip. */
async function probeIndexedDb(): Promise<ArchiveStorageAdapter> {
  const db = await openDb()
  const probeKey = '__fitarchive_probe__'
  await idbSet(db, probeKey, Date.now())
  await idbGet(db, probeKey)
  await idbSet(db, probeKey, undefined)
  return createIndexedDbAdapter(db)
}

/** Reject if `promise` has not settled within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('IndexedDB probe timed out')),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Try to open IndexedDB and verify a real write/read roundtrip. Returns a
 * working adapter, or null if IndexedDB is unavailable, blocked, OR stalls.
 *
 * The timeout matters: some environments (private mode, certain headless
 * browsers) leave `open()` pending forever — firing neither success nor error.
 * Without the timeout the whole app would hang on "Opening the archive…".
 */
export async function tryCreateIndexedDbAdapter(): Promise<ArchiveStorageAdapter | null> {
  if (!isIndexedDbAvailable()) return null
  try {
    return await withTimeout(probeIndexedDb(), 2500)
  } catch (error) {
    console.warn('[archive] IndexedDB unavailable or slow, falling back', error)
    return null
  }
}
