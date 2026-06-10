import { describe, expect, it } from 'vitest'
import { createMemoryBlobStore } from './assetBlobStore'
import {
  archiveBlobKeys,
  blobBackDraftAsset,
  cleanupOrphanBlobs,
  dataUrlToBlob,
  dehydrateGarmentForStorage,
  garmentBlobKeys,
  hydrateGarmentForRuntime,
  isBlobBacked,
} from './garmentAssetStorage'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { emptyGarmentDraft } from '../../domain/garmentDraft'
import { makeGarment } from '../../test/factories'
import type {
  AssetImageRef,
  GarmentAsset,
  GarmentItem,
} from '../../domain/garmentTypes'

const blobOf = (s: string) => new Blob([s], { type: 'image/webp' })
const ref = (key: string): AssetImageRef => ({ kind: 'indexeddb-blob', key })

describe('dehydrate / hydrate (legacy passthrough)', () => {
  it('leaves a garment without refs completely unchanged', async () => {
    const legacy = makeGarment({
      imageDataUrl: 'data:thumb',
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:ref',
        productReferenceImageUrl: 'data:ref',
        cutoutImageUrl: 'data:cutout',
        assetMode: 'product-reference',
      },
    })
    expect(isBlobBacked(legacy.asset)).toBe(false)
    expect(dehydrateGarmentForStorage(legacy)).toBe(legacy) // same reference
    const store = createMemoryBlobStore(true)
    expect(await hydrateGarmentForRuntime(legacy, store)).toBe(legacy)
    expect(getGarmentDisplayImage(legacy)).toBe('data:ref')
  })
})

describe('blobBackDraftAsset', () => {
  it('backs cropped + cutout data URLs as refs on a durable store', async () => {
    const store = createMemoryBlobStore(true)
    const draft = {
      ...emptyGarmentDraft('data:thumb'),
      name: 'Tee',
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:cutout',
        croppedImageUrl: 'data:image/jpeg;base64,Y3JvcA==', // "crop"
        cutoutImageUrl: 'data:image/webp;base64,Y3V0b3V0', // "cutout"
        assetMode: 'cutout' as const,
      },
    }
    const out = await blobBackDraftAsset(draft, store)
    expect(out.asset?.croppedImageRef?.kind).toBe('indexeddb-blob')
    expect(out.asset?.cutoutImageRef?.kind).toBe('indexeddb-blob')
    // The data URL strings are kept for immediate display.
    expect(out.asset?.cutoutImageUrl).toBe('data:image/webp;base64,Y3V0b3V0')
    // The stored blob holds the decoded bytes ("cutout" = 6 bytes).
    const got = await store.get(out.asset!.cutoutImageRef!.key)
    expect(got).not.toBeNull()
    expect(got!.type).toBe('image/webp')
    expect(got!.size).toBe(6)
  })

  it('falls back to the data URL when a (durable) put fails', async () => {
    // A durable store whose put fails (e.g. IDB quota/abort) must not strand the
    // upload: the field stays a data URL, no ref is attached.
    const failing = { ...createMemoryBlobStore(true), put: async () => null }
    const draft = {
      ...emptyGarmentDraft('data:thumb'),
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:cutout',
        cutoutImageUrl: 'data:image/webp;base64,Y3V0b3V0',
        assetMode: 'cutout' as const,
      },
    }
    const out = await blobBackDraftAsset(draft, failing)
    expect(out.asset?.cutoutImageRef).toBeUndefined()
    expect(out.asset?.cutoutImageUrl).toBe('data:image/webp;base64,Y3V0b3V0')
  })

  it('preserves the selected inline cutout when only the crop blob put succeeds', async () => {
    const store = createMemoryBlobStore(true)
    let puts = 0
    const partial = {
      ...store,
      put: async (blob: Blob) => {
        puts++
        return puts === 1 ? store.put(blob) : null
      },
    }
    const draft = {
      ...emptyGarmentDraft('data:thumb'),
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:image/webp;base64,Y3V0b3V0',
        croppedImageUrl: 'data:image/jpeg;base64,Y3JvcA==',
        cutoutImageUrl: 'data:image/webp;base64,Y3V0b3V0',
        assetMode: 'cutout' as const,
      },
    }

    const backed = await blobBackDraftAsset(draft, partial)
    expect(backed.asset?.croppedImageRef).toBeDefined()
    expect(backed.asset?.cutoutImageRef).toBeUndefined()

    const garment = makeGarment({ ...backed, id: 'partial' })
    const stored = dehydrateGarmentForStorage(garment)
    expect(stored.asset?.cutoutImageUrl).toBe(draft.asset.cutoutImageUrl)

    const hydrated = await hydrateGarmentForRuntime(stored, partial)
    expect(getGarmentDisplayImage(hydrated)).toBe(draft.asset.cutoutImageUrl)
  })

  it('does NOT blob-back on a non-durable store (graceful fallback)', async () => {
    const store = createMemoryBlobStore(false)
    const draft = {
      ...emptyGarmentDraft('data:thumb'),
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:cutout',
        cutoutImageUrl: 'data:image/webp;base64,Y3V0b3V0',
        assetMode: 'cutout' as const,
      },
    }
    const out = await blobBackDraftAsset(draft, store)
    expect(out.asset?.cutoutImageRef).toBeUndefined()
    expect(out.asset?.cutoutImageUrl).toBe('data:image/webp;base64,Y3V0b3V0')
  })
})

describe('round-trip identity (no data loss)', () => {
  async function roundTrip(garment: GarmentItem, store = createMemoryBlobStore(true)) {
    const stored = dehydrateGarmentForStorage(garment)
    return hydrateGarmentForRuntime(stored, store)
  }

  it('an accepted cutout round-trips to its blob bytes', async () => {
    const store = createMemoryBlobStore(true)
    const key = (await store.put(blobOf('cutout-bytes')))!
    const g = makeGarment({
      imageDataUrl: 'data:thumb',
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:cutout',
        cutoutImageUrl: 'data:cutout',
        cutoutImageRef: ref(key),
        assetMode: 'cutout',
      },
    })
    // Dehydrated form is lean.
    const stored = dehydrateGarmentForStorage(g)
    expect(stored.asset?.displayImageUrl).toBe('')
    expect(stored.asset?.cutoutImageUrl).toBeUndefined()
    expect(stored.asset?.cutoutImageRef).toEqual(ref(key))
    expect(stored.imageDataUrl).toBe('data:thumb') // thumbnail kept

    const hydrated = await hydrateGarmentForRuntime(stored, store)
    const display = getGarmentDisplayImage(hydrated)
    expect(display).toBe(`blob:memory/${key}`)
    // Resolves to the same bytes the cutout had.
    const url = await store.getObjectUrl(key)
    expect(display).toBe(url)
  })

  it('a cropped garment round-trips to its crop blob', async () => {
    const store = createMemoryBlobStore(true)
    const key = (await store.put(blobOf('crop-bytes')))!
    const g = makeGarment({
      imageDataUrl: 'data:thumb',
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:crop',
        croppedImageUrl: 'data:crop',
        croppedImageRef: ref(key),
        assetMode: 'cropped',
      },
    })
    const hydrated = await roundTrip(g, store)
    expect(getGarmentDisplayImage(hydrated)).toBe(`blob:memory/${key}`)
  })
})

describe('precedence after hydrate (the #1 rule)', () => {
  it('a product-reference display is NOT shadowed by a stored cutout blob', async () => {
    const store = createMemoryBlobStore(true)
    const cutoutKey = (await store.put(blobOf('stale-cutout')))!
    const g = makeGarment({
      imageDataUrl: 'data:thumb',
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'https://ref.example/p.jpg',
        productReferenceImageUrl: 'https://ref.example/p.jpg',
        cutoutImageRef: ref(cutoutKey), // a stored-but-not-chosen cutout
        assetMode: 'product-reference',
      },
    })
    expect(isBlobBacked(g.asset)).toBe(true) // it IS blob-backed (has a ref)
    const hydrated = await hydrateGarmentForRuntime(
      dehydrateGarmentForStorage(g),
      store,
    )
    // The reference wins; the stored cutout blob is never resolved/shown.
    expect(getGarmentDisplayImage(hydrated)).toBe('https://ref.example/p.jpg')
    expect(getGarmentDisplayImage(hydrated)).not.toBe(`blob:memory/${cutoutKey}`)
  })
})

describe('graceful degradation', () => {
  it('a missing cutout blob falls back to the thumbnail, never broken', async () => {
    const store = createMemoryBlobStore(true) // empty: the key is not present
    const g = makeGarment({
      imageDataUrl: 'data:thumb',
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:cutout',
        cutoutImageRef: ref('asset_gone'),
        assetMode: 'cutout',
      },
    })
    const hydrated = await hydrateGarmentForRuntime(
      dehydrateGarmentForStorage(g),
      store,
    )
    expect(getGarmentDisplayImage(hydrated)).toBe('data:thumb')
  })
})

describe('utilities', () => {
  it('garmentBlobKeys lists owned blob keys', () => {
    const g = makeGarment({
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:cutout',
        croppedImageRef: ref('k1'),
        cutoutImageRef: ref('k2'),
        assetMode: 'cutout',
      },
    })
    expect(garmentBlobKeys(g).sort()).toEqual(['k1', 'k2'])
    expect(garmentBlobKeys(makeGarment())).toEqual([])
  })

  it('garmentBlobKeys deduplicates keys and ignores empty malformed refs', () => {
    const g = makeGarment({
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:cutout',
        croppedImageRef: ref('shared'),
        cutoutImageRef: ref('shared'),
        assetMode: 'cutout',
      },
    })
    expect(garmentBlobKeys(g)).toEqual(['shared'])

    g.asset!.cutoutImageRef = ref('')
    expect(garmentBlobKeys(g)).toEqual(['shared'])
  })

  it('garmentBlobKeys collects EVERY *ImageRef field (wiring lock)', () => {
    // The orphan sweep deletes any blob NOT returned by garmentBlobKeys, so a new
    // `*ImageRef` field that is not wired in here would be classified as an orphan
    // and silently deleted. `BlobRefKeys` is the set of GarmentAsset fields typed
    // as AssetImageRef: adding a new one forces it into this fixture (TS error
    // otherwise), and the assertion then forces it into garmentBlobKeys.
    type BlobRefKeys = {
      [K in keyof GarmentAsset]-?: NonNullable<
        GarmentAsset[K]
      > extends AssetImageRef
        ? K
        : never
    }[keyof GarmentAsset]
    const refs: Record<BlobRefKeys, AssetImageRef> = {
      croppedImageRef: ref('k-crop'),
      cutoutImageRef: ref('k-cut'),
    }
    const g = makeGarment({
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:thumb',
        assetMode: 'cutout',
        ...refs,
      },
    })
    expect(garmentBlobKeys(g).sort()).toEqual(
      Object.values(refs)
        .map((r) => r.key)
        .sort(),
    )
  })

  it('dataUrlToBlob decodes base64 and rejects junk', () => {
    const blob = dataUrlToBlob('data:image/webp;base64,Y3V0b3V0')
    expect(blob?.type).toBe('image/webp')
    expect(dataUrlToBlob('not-a-data-url')).toBeNull()
  })

  it('archiveBlobKeys dedups and ignores remote/data-URL fields', () => {
    const cutout = makeGarment({
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:cutout',
        cutoutImageRef: ref('k1'),
        assetMode: 'cutout',
      },
    })
    const cropped = makeGarment({
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'data:crop',
        croppedImageRef: ref('k2'),
        assetMode: 'cropped',
      },
    })
    const referenceOnly = makeGarment({
      asset: {
        originalImageUrl: 'data:thumb',
        displayImageUrl: 'https://ref.example/p.jpg',
        productReferenceImageUrl: 'https://ref.example/p.jpg', // NOT a blob key
        cutoutImageUrl: 'data:cutout', // NOT a blob key
        assetMode: 'product-reference',
      },
    })
    const legacy = makeGarment() // no asset
    const keys = archiveBlobKeys([cutout, cropped, referenceOnly, legacy])
    expect([...keys].sort()).toEqual(['k1', 'k2'])
  })
})

describe('cleanupOrphanBlobs (orphan sweep)', () => {
  it('deletes only blobs not referenced by any garment', async () => {
    const store = createMemoryBlobStore(true)
    const kept = (await store.put(blobOf('keep')))!
    const orphan = (await store.put(blobOf('orphan')))!

    const result = await cleanupOrphanBlobs(
      store,
      await store.listKeys(),
      () => new Set([kept]),
      { minAgeMs: 0 }, // neutralize the age gate for this non-age test
    )
    expect(result.deleted).toEqual([orphan])
    expect(await store.get(kept)).not.toBeNull()
    expect(await store.get(orphan)).toBeNull()
  })

  it('reads the referenced set after the candidate snapshot (a concurrently-referenced key is kept)', async () => {
    const store = createMemoryBlobStore(true)
    const k = (await store.put(blobOf('x')))!
    // The getter returns a set that includes k — i.e. it became referenced.
    const candidates = await store.listKeys()
    const result = await cleanupOrphanBlobs(store, candidates, () => new Set([k]))
    expect(result.deleted).toEqual([])
    expect(await store.get(k)).not.toBeNull()
  })

  it('never sweeps a blob written after the frozen candidate snapshot', async () => {
    const store = createMemoryBlobStore(true)
    const orphan = (await store.put(blobOf('old-orphan')))!
    const candidates = await store.listKeys()
    const newUpload = (await store.put(blobOf('new-upload')))!

    const result = await cleanupOrphanBlobs(store, candidates, () => new Set(), {
      minAgeMs: 0,
    })
    expect(result.deleted).toEqual([orphan])
    expect(await store.get(newUpload)).not.toBeNull()
  })

  it('fails CLOSED: a throwing referenced-set read deletes nothing', async () => {
    const store = createMemoryBlobStore(true)
    const k = (await store.put(blobOf('x')))!
    const result = await cleanupOrphanBlobs(store, await store.listKeys(), () => {
      throw new Error('cannot collect refs')
    })
    expect(result.deleted).toEqual([])
    expect(await store.get(k)).not.toBeNull()
  })

  it('a delete failure does not abort the sweep', async () => {
    const base = createMemoryBlobStore(true)
    const a = (await base.put(blobOf('a')))!
    const b = (await base.put(blobOf('b')))!
    const store = {
      ...base,
      delete: async (key: string) => {
        if (key === a) throw new Error('delete failed')
        return base.delete(key)
      },
    }
    const result = await cleanupOrphanBlobs(
      store,
      await store.listKeys(),
      () => new Set<string>(),
      { minAgeMs: 0 },
    )
    // b was still deleted despite a throwing.
    expect(result.deleted).toEqual([b])
    expect(await base.get(b)).toBeNull()
  })

  it('an empty store is a no-op', async () => {
    const store = createMemoryBlobStore(true)
    expect((await cleanupOrphanBlobs(store, [], () => new Set())).deleted).toEqual([])
  })
})

describe('cleanupOrphanBlobs (Phase 12.5 orphan-age gate)', () => {
  const NOW = 10_000_000
  const HOUR = 60 * 60 * 1000
  const oldKey = `asset_${NOW - 2 * HOUR}_old` // 2h old
  const recentKey = `asset_${NOW - 60_000}_recent` // 1min old
  const legacyKey = 'asset_legacyuuidwithnotimestamp' // pre-12.5, no timestamp

  it('deletes old orphans, keeps recent and timestamp-less ones', async () => {
    const store = createMemoryBlobStore(true)
    const result = await cleanupOrphanBlobs(
      store,
      [oldKey, recentKey, legacyKey],
      () => new Set<string>(),
      { now: NOW, minAgeMs: HOUR },
    )
    expect(result.deleted).toEqual([oldKey])
    expect(result.keptRecent.sort()).toEqual([legacyKey, recentKey].sort())
  })

  it('never deletes a referenced blob even when it is old', async () => {
    const store = createMemoryBlobStore(true)
    const result = await cleanupOrphanBlobs(
      store,
      [oldKey],
      () => new Set([oldKey]), // referenced
      { now: NOW, minAgeMs: HOUR },
    )
    expect(result.deleted).toEqual([])
  })

  it('a blob whose timestamp cannot be parsed (legacy) is never swept', async () => {
    const store = createMemoryBlobStore(true)
    const result = await cleanupOrphanBlobs(
      store,
      [legacyKey],
      () => new Set<string>(),
      { now: NOW, minAgeMs: 0 }, // even with a zero threshold, no timestamp → keep
    )
    expect(result.deleted).toEqual([])
    expect(result.keptRecent).toEqual([legacyKey])
  })

  it('cross-tab race: a sibling tab’s just-written blob is kept until it ages out', async () => {
    const store = createMemoryBlobStore(true)
    const siblingBlob = `asset_${NOW - 5_000}_sibling` // written 5s ago by Tab A
    // Tab B sweeps; the sibling's garment metadata is not yet visible here.
    const recent = await cleanupOrphanBlobs(
      store,
      [siblingBlob],
      () => new Set<string>(),
      { now: NOW, minAgeMs: HOUR },
    )
    expect(recent.deleted).toEqual([]) // recent → kept (no quality loss)
    // Later, still unreferenced and now old → eligible.
    const later = await cleanupOrphanBlobs(
      store,
      [siblingBlob],
      () => new Set<string>(),
      { now: NOW + 2 * HOUR, minAgeMs: HOUR },
    )
    expect(later.deleted).toEqual([siblingBlob])
  })
})
