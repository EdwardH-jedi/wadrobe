// Asset blob store (Phase 11) — heavy garment image bytes live here as Blobs,
// keyed by id, so garment METADATA can stay lightweight (it keeps a tiny
// thumbnail + blob refs instead of multiple large data URLs).
//
// Design:
// - A small, swappable interface. The IndexedDB backend is durable across real
//   page reloads; the memory backend is a session-only fallback used when IDB is
//   unavailable (so blob-backing never *replaces* durable data — see `durable`).
// - `put()` resolves its key only after the IDB transaction COMMITS, so a ref is
//   never attached to a blob that did not actually land.
// - The store owns object-URL lifecycle: `getObjectUrl(key)` caches one URL per
//   key (reused across re-hydrations, no leak), and `delete`/`clear`/`revoke`
//   revoke it. Keeping it here means the resolve/hydrate code never touches
//   `URL.createObjectURL` directly (and unit tests can use a fake URL).
//
// This is the storage seam a future higher-quality (ML/WASM) cutout would also
// use — it stores Blobs, it does not produce them. No cloud, no network.
import { createId } from '../id'

/**
 * Mint a blob key that EMBEDS its creation time: `asset_<ms>_<random>` (Phase
 * 12.5). The leading timestamp segment powers the orphan-age gate without
 * touching the blob read path or the DB schema. Legacy keys (`asset_<uuid>`,
 * pre-12.5) have no numeric segment and so read back as "no timestamp".
 */
function mintBlobKey(nowMs: number): string {
  // createId('') → `_<uuid>`, so this is `asset_<ms>_<uuid>`.
  return `asset_${nowMs}${createId('')}`
}

/**
 * The creation time embedded in a blob key, or `undefined` for a legacy key
 * without a timestamp segment. Pure — used by the orphan-age gate.
 */
export function parseBlobCreatedAt(key: string): number | undefined {
  const m = /^asset_(\d+)_/.exec(key)
  return m ? Number(m[1]) : undefined
}

export interface AssetBlobStore {
  /**
   * `true` only for a backend that survives a real page reload (IndexedDB).
   * Callers must NOT replace durable data-URL fields with refs unless this is
   * true — otherwise a reload would lose the image.
   */
  readonly durable: boolean
  readonly backend: 'indexeddb' | 'memory'
  /** Store a blob; resolves the key on commit, or null on failure. */
  put(blob: Blob): Promise<string | null>
  get(key: string): Promise<Blob | null>
  /** A cached object URL for the blob (one per key), or null if missing. */
  getObjectUrl(key: string): Promise<string | null>
  delete(key: string): Promise<void>
  /** Revoke (only) the cached object URL for a key. */
  revoke(key: string): void
  /**
   * Snapshot of every stored blob key present when the call begins. Fails CLOSED
   * — on any error it resolves `[]`, so the sweep deletes nothing rather than
   * risking a real blob.
   */
  listKeys(): Promise<string[]>
  clear(): Promise<void>
}

// --- Memory backend (session-only fallback + the unit-test store) -------------

/**
 * In-memory blob store. `durable` defaults to false (the production fallback when
 * IndexedDB is absent — blob-backing is skipped so nothing is lost on reload).
 * Tests pass `durable: true` to exercise the blob path without a real IDB, since
 * a remount in the same JS context keeps the Map alive (a test "reload").
 */
export function createMemoryBlobStore(
  durable = false,
  now: () => number = () => Date.now(),
): AssetBlobStore {
  const blobs = new Map<string, Blob>()
  const urls = new Map<string, string>()
  return {
    durable,
    backend: 'memory',
    async put(blob) {
      const key = mintBlobKey(now())
      blobs.set(key, blob)
      return key
    },
    async get(key) {
      return blobs.get(key) ?? null
    },
    async getObjectUrl(key) {
      const cached = urls.get(key)
      if (cached) return cached
      if (!blobs.has(key)) return null
      // Fake, jsdom-safe URL (no real createObjectURL in the test env).
      const url = `blob:memory/${key}`
      urls.set(key, url)
      return url
    },
    async delete(key) {
      blobs.delete(key)
      urls.delete(key)
    },
    revoke(key) {
      urls.delete(key)
    },
    async listKeys() {
      return [...blobs.keys()]
    },
    async clear() {
      blobs.clear()
      urls.clear()
    },
  }
}

// --- IndexedDB backend (durable) ----------------------------------------------

const DB_NAME = 'fit-archive-assets'
const DB_VERSION = 1
const STORE = 'blobs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('open failed'))
    request.onblocked = () => reject(new Error('open blocked'))
  })
}

function idbGet(db: IDBDatabase, key: string): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
    req.onerror = () => reject(req.error ?? new Error('get failed'))
  })
}

function idbPut(db: IDBDatabase, key: string, blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    // Resolve on COMMIT, not request success — guarantees the blob landed.
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('put failed'))
    tx.onabort = () => reject(tx.error ?? new Error('put aborted'))
  })
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('delete failed'))
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

function idbGetAllKeys(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAllKeys()
    req.onsuccess = () =>
      resolve((req.result as IDBValidKey[]).map((k) => String(k)))
    req.onerror = () => reject(req.error ?? new Error('getAllKeys failed'))
  })
}

function createIdbBlobStore(db: IDBDatabase): AssetBlobStore {
  const urls = new Map<string, string>()
  const revokeUrl = (key: string) => {
    const url = urls.get(key)
    if (url && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(url)
    }
    urls.delete(key)
  }
  return {
    durable: true,
    backend: 'indexeddb',
    async put(blob) {
      const key = mintBlobKey(Date.now())
      try {
        await idbPut(db, key, blob)
        return key
      } catch {
        return null
      }
    },
    async get(key) {
      try {
        return await idbGet(db, key)
      } catch {
        return null
      }
    },
    async getObjectUrl(key) {
      const cached = urls.get(key)
      if (cached) return cached
      const blob = await this.get(key)
      if (!blob) return null
      try {
        const url = URL.createObjectURL(blob)
        urls.set(key, url)
        return url
      } catch {
        return null
      }
    },
    async delete(key) {
      revokeUrl(key)
      try {
        await idbDelete(db, key)
      } catch {
        /* non-fatal */
      }
    },
    revoke(key) {
      revokeUrl(key)
    },
    async listKeys() {
      try {
        return await idbGetAllKeys(db)
      } catch {
        return [] // fail closed: the sweep deletes nothing on a read error
      }
    },
    async clear() {
      for (const key of [...urls.keys()]) revokeUrl(key)
      try {
        await idbClear(db)
      } catch {
        /* non-fatal */
      }
    },
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('asset store timed out')), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

/** Try the durable IndexedDB blob store; null if unavailable/blocked/slow. */
export async function tryCreateIndexedDbBlobStore(): Promise<AssetBlobStore | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await withTimeout(openDb(), 2500)
    return createIdbBlobStore(db)
  } catch {
    return null
  }
}

let cached: Promise<AssetBlobStore> | null = null
let override: AssetBlobStore | null = null

/** Resolve the best blob store: durable IndexedDB, else a non-durable memory
 *  fallback (which skips blob-backing so reloads never lose data). Memoized. */
export function getAssetBlobStore(): Promise<AssetBlobStore> {
  if (override) return Promise.resolve(override)
  if (!cached) {
    cached = (async () =>
      (await tryCreateIndexedDbBlobStore()) ?? createMemoryBlobStore(false))()
  }
  return cached
}

/** TEST-ONLY: inject a store (and reset the memo). Pass null to restore. */
export function __setAssetBlobStoreForTests(store: AssetBlobStore | null): void {
  override = store
  cached = null
}
