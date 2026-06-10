import { describe, expect, it } from 'vitest'
import {
  createMemoryBlobStore,
  getAssetBlobStore,
  parseBlobCreatedAt,
  tryCreateIndexedDbBlobStore,
} from './assetBlobStore'

const blobOf = (s: string) => new Blob([s], { type: 'image/webp' })

describe('blob key timestamps (Phase 12.5)', () => {
  it('put mints a key that embeds the creation time', async () => {
    const store = createMemoryBlobStore(true, () => 1_700_000_000_000)
    const key = (await store.put(blobOf('x')))!
    expect(key).toMatch(/^asset_1700000000000_/)
    expect(parseBlobCreatedAt(key)).toBe(1_700_000_000_000)
  })

  it('parseBlobCreatedAt returns undefined for a legacy (timestamp-less) key', () => {
    expect(parseBlobCreatedAt('asset_550e8400-e29b-41d4-a716-446655440000')).toBeUndefined()
    expect(parseBlobCreatedAt('asset_legacy')).toBeUndefined()
    expect(parseBlobCreatedAt('not-an-asset-key')).toBeUndefined()
  })

  it('get/getObjectUrl still work for a timestamped key (read path unchanged)', async () => {
    const store = createMemoryBlobStore(true, () => 1_700_000_000_000)
    const blob = blobOf('y')
    const key = (await store.put(blob))!
    expect(await store.get(key)).toBe(blob)
    expect(await store.getObjectUrl(key)).toBe(`blob:memory/${key}`)
  })
})

describe('memory blob store', () => {
  it('put → get round-trips a blob under a returned key', async () => {
    const store = createMemoryBlobStore(true)
    const blob = blobOf('cutout-bytes')
    const key = await store.put(blob)
    expect(key).toMatch(/^asset_/)
    const got = await store.get(key!)
    expect(got).toBe(blob) // the memory store hands back the same Blob
  })

  it('getObjectUrl caches one URL per key and missing keys return null', async () => {
    const store = createMemoryBlobStore(true)
    const key = await store.put(blobOf('x'))
    const a = await store.getObjectUrl(key!)
    const b = await store.getObjectUrl(key!)
    expect(a).toBe(b) // cached, stable
    expect(await store.getObjectUrl('asset_missing')).toBeNull()
  })

  it('delete removes the blob and its url; get then returns null', async () => {
    const store = createMemoryBlobStore(true)
    const key = await store.put(blobOf('x'))
    await store.getObjectUrl(key!)
    await store.delete(key!)
    expect(await store.get(key!)).toBeNull()
    expect(await store.getObjectUrl(key!)).toBeNull()
  })

  it('clear empties the store and revokes urls', async () => {
    const store = createMemoryBlobStore(true)
    const k1 = await store.put(blobOf('a'))
    const k2 = await store.put(blobOf('b'))
    await store.getObjectUrl(k1!)
    await store.clear()
    expect(await store.get(k1!)).toBeNull()
    expect(await store.get(k2!)).toBeNull()
    expect(await store.listKeys()).toEqual([])
    // After clear the url cache is empty, so a re-resolve returns null (no blob).
    expect(await store.getObjectUrl(k1!)).toBeNull()
  })

  it('listKeys enumerates stored keys and drops deleted ones', async () => {
    const store = createMemoryBlobStore(true)
    const k1 = (await store.put(blobOf('a')))!
    const k2 = (await store.put(blobOf('b')))!
    expect((await store.listKeys()).sort()).toEqual([k1, k2].sort())
    await store.delete(k1)
    expect(await store.listKeys()).toEqual([k2])
  })

  it('the production memory fallback reports non-durable (skips blob-backing)', () => {
    expect(createMemoryBlobStore().durable).toBe(false)
    expect(createMemoryBlobStore(true).durable).toBe(true)
  })
})

describe('IndexedDB blob store availability', () => {
  it('degrades gracefully when IndexedDB is unavailable (jsdom)', async () => {
    // jsdom has no IndexedDB → the factory returns null rather than throwing.
    const store = await tryCreateIndexedDbBlobStore()
    expect(store).toBeNull()
  })

  it('getAssetBlobStore always resolves a usable store (memory fallback here)', async () => {
    const store = await getAssetBlobStore()
    expect(store.backend).toBe('memory')
    expect(store.durable).toBe(false)
  })
})
