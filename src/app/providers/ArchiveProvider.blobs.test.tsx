import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ArchiveProvider } from './ArchiveProvider'
import { useArchive } from './useArchive'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { emptyGarmentDraft, garmentToDraft } from '../../domain/garmentDraft'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import {
  __setAssetBlobStoreForTests,
  createMemoryBlobStore,
  getAssetBlobStore,
  type AssetBlobStore,
} from '../../lib/storage/assetBlobStore'
import { blobBackDraftAsset } from '../../lib/storage/garmentAssetStorage'
import type { GarmentDraft } from '../../domain/garmentTypes'
import { makeGarment } from '../../test/factories'

// Phase 11 blob-backed persistence, driven through the REAL provider over the
// REAL (localStorage) metadata facade PLUS an injected DURABLE memory blob store.
// jsdom has no IndexedDB, so the durable memory store stands in: a remount in the
// same JS context keeps its Map alive (a "reload"), letting us prove the blob
// round-trip and precedence without a real browser.

let store: AssetBlobStore

function wrapper({ children }: { children: ReactNode }) {
  return <ArchiveProvider>{children}</ArchiveProvider>
}

async function renderArchive() {
  const view = renderHook(() => useArchive(), { wrapper })
  await waitFor(() => expect(view.result.current.hydrated).toBe(true))
  return view
}

// A cutout draft whose cutout data URL is a distinctive marker we can grep for.
const CUTOUT_MARKER = 'data:image/webp;base64,Q1VUT1VUMTE='
const REF_URL = 'https://ref.example/product.jpg'

const cutoutDraft = (): GarmentDraft => ({
  ...emptyGarmentDraft('data:thumb'),
  name: 'Cutout Coat',
  category: 'outerwear',
  asset: {
    originalImageUrl: 'data:thumb',
    displayImageUrl: CUTOUT_MARKER,
    cutoutImageUrl: CUTOUT_MARKER,
    assetMode: 'cutout',
  },
})

const referenceWithStoredCutoutDraft = (): GarmentDraft => ({
  ...emptyGarmentDraft('data:thumb'),
  name: 'Ref Coat',
  category: 'outerwear',
  asset: {
    originalImageUrl: 'data:thumb',
    displayImageUrl: REF_URL,
    productReferenceImageUrl: REF_URL,
    cutoutImageUrl: CUTOUT_MARKER, // a stored-but-not-chosen cutout
    assetMode: 'product-reference',
  },
})

beforeEach(() => {
  localStorage.clear()
  store = createMemoryBlobStore(true) // durable stand-in
  __setAssetBlobStoreForTests(store)
})

afterEach(() => {
  __setAssetBlobStoreForTests(null)
})

describe('ArchiveProvider — blob-backed persistence (Phase 11)', () => {
  it('Case A — an accepted cutout is blob-backed, stored lean, and survives reload', async () => {
    const first = await renderArchive()
    const s = await getAssetBlobStore()
    const draft = await blobBackDraftAsset(cutoutDraft(), s)
    const cutoutKey = draft.asset!.cutoutImageRef!.key
    expect(cutoutKey).toMatch(/^asset_/)

    let id = ''
    act(() => {
      id = first.result.current.addGarment(draft).id
    })
    act(() => first.result.current.selectGarment(id))
    act(() => {
      first.result.current.saveOutfit('Cutout Look')
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        'indexeddb-blob',
      ),
    )

    // Metadata is lean: the heavy cutout data URL is NOT in localStorage, the
    // ref + thumbnail are.
    const raw = localStorage.getItem(STORAGE_KEYS.garments)!
    expect(raw).not.toContain('Q1VUT1VUMTE=') // the cutout marker is gone
    expect(raw).toContain(cutoutKey)
    expect(raw).toContain('data:thumb')

    first.unmount()

    // Reload: a fresh provider over the same localStorage + the same blob store.
    const second = await renderArchive()
    const g = second.result.current.getGarment(id)!
    expect(g.asset?.assetMode).toBe('cutout')
    expect(g.asset?.cutoutImageRef?.key).toBe(cutoutKey)
    expect(getGarmentDisplayImage(g)).toBe(`blob:memory/${cutoutKey}`)
    // Outfit references still resolve.
    expect(second.result.current.currentOutfit.outerwear).toBe(id)
    expect(second.result.current.savedOutfits[0]?.selection.outerwear).toBe(id)
  })

  it('Case B — product-reference display survives reload even with a stored cutout blob', async () => {
    const first = await renderArchive()
    const s = await getAssetBlobStore()
    const draft = await blobBackDraftAsset(referenceWithStoredCutoutDraft(), s)
    expect(draft.asset!.cutoutImageRef?.key).toMatch(/^asset_/) // cutout WAS stored

    let id = ''
    act(() => {
      id = first.result.current.addGarment(draft).id
    })
    act(() => first.result.current.selectGarment(id))
    act(() => {
      first.result.current.saveOutfit('Ref Look')
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        'product-reference',
      ),
    )
    first.unmount()

    const second = await renderArchive()
    const g = second.result.current.getGarment(id)!
    expect(g.asset?.assetMode).toBe('product-reference')
    // The reference wins; the stored cutout blob never shadows it after reload.
    expect(getGarmentDisplayImage(g)).toBe(REF_URL)
    expect(g.asset?.cutoutImageRef?.key).toBeTruthy() // still stored
    expect(second.result.current.savedOutfits[0]?.selection.outerwear).toBe(id)
  })

  it('deleting a garment cleans its blobs but keeps other garments and their blobs', async () => {
    const { result } = await renderArchive()
    const s = await getAssetBlobStore()
    const d1 = await blobBackDraftAsset(cutoutDraft(), s)
    const d2 = await blobBackDraftAsset(cutoutDraft(), s)
    const k1 = d1.asset!.cutoutImageRef!.key
    const k2 = d2.asset!.cutoutImageRef!.key

    let id1 = ''
    act(() => {
      id1 = result.current.addGarment(d1).id
      result.current.addGarment(d2)
    })
    expect(await store.get(k1)).not.toBeNull()
    expect(await store.get(k2)).not.toBeNull()

    act(() => result.current.removeGarment(id1))
    await waitFor(async () => expect(await store.get(k1)).toBeNull())
    // The other garment's blob is untouched.
    expect(await store.get(k2)).not.toBeNull()
    expect(result.current.garments).toHaveLength(1)
  })

  it('editing a hydrated blob-backed garment never leaks an object URL to storage', async () => {
    // Lifecycle 1: archive a blob-backed cutout.
    const first = await renderArchive()
    const s = await getAssetBlobStore()
    const draft = await blobBackDraftAsset(cutoutDraft(), s)
    const key = draft.asset!.cutoutImageRef!.key
    let id = ''
    act(() => {
      id = first.result.current.addGarment(draft).id
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        'indexeddb-blob',
      ),
    )
    first.unmount()

    // Lifecycle 2 (reload): now hydrated → the display is a blob: object URL.
    const second = await renderArchive()
    const hydrated = second.result.current.getGarment(id)!
    expect(getGarmentDisplayImage(hydrated)).toBe(`blob:memory/${key}`)
    // Edit via the REAL path: garmentToDraft (copies the blob: url + refs) →
    // rename → updateGarment.
    act(() => {
      second.result.current.updateGarment(id, {
        ...garmentToDraft(hydrated),
        name: 'Renamed',
      })
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain('Renamed'),
    )
    // The transient object URL must NEVER reach storage (dehydrate strips it).
    expect(localStorage.getItem(STORAGE_KEYS.garments)).not.toContain('blob:')
    second.unmount()

    // Lifecycle 3 (reload): the rename stuck AND the cutout still resolves.
    const third = await renderArchive()
    const g = third.result.current.getGarment(id)!
    expect(g.name).toBe('Renamed')
    expect(g.asset?.cutoutImageRef?.key).toBe(key)
    expect(getGarmentDisplayImage(g)).toBe(`blob:memory/${key}`)
  })

  it('the hydration orphan sweep reclaims an OLD blob left by a prior failed save', async () => {
    // Use an old clock so blobs written in this test are past the age threshold.
    const oldStore = createMemoryBlobStore(true, () => Date.now() - 2 * 60 * 60 * 1000)
    __setAssetBlobStoreForTests(oldStore)
    const first = await renderArchive()
    const s = await getAssetBlobStore()
    const draft = await blobBackDraftAsset(cutoutDraft(), s)
    const refKey = draft.asset!.cutoutImageRef!.key
    act(() => {
      first.result.current.addGarment(draft)
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        'indexeddb-blob',
      ),
    )
    // Simulate "blob landed but its garment never persisted": an orphan blob.
    const orphanKey = (await s.put(new Blob(['orphan'], { type: 'image/webp' })))!
    expect(await s.get(orphanKey)).not.toBeNull()
    first.unmount()

    // Lifecycle 2 (reload): the fire-and-forget hydration sweep reclaims the
    // OLD orphan but never touches the referenced blob.
    const second = await renderArchive()
    await waitFor(async () => expect(await s.get(orphanKey)).toBeNull())
    expect(await s.get(refKey)).not.toBeNull() // referenced blob untouched
    expect(getGarmentDisplayImage(second.result.current.garments[0])).toBe(
      `blob:memory/${refKey}`,
    )
  })

  it('the age gate keeps a RECENT orphan across reload (cross-tab safety)', async () => {
    // Default (real-clock) store → a freshly-written orphan reads as "recent".
    const first = await renderArchive()
    const s = await getAssetBlobStore()
    const draft = await blobBackDraftAsset(cutoutDraft(), s)
    act(() => {
      first.result.current.addGarment(draft)
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        'indexeddb-blob',
      ),
    )
    const recentOrphan = (await s.put(new Blob(['recent'], { type: 'image/webp' })))!
    first.unmount()

    const second = await renderArchive()
    // Give the fire-and-forget sweep a chance to (wrongly) delete the recent
    // orphan. The assertion is timing-independent: "still present" is the steady
    // state both before and after the sweep — the sweep can only DELETE, so a
    // slow sweep can't flake a non-deletion assertion. It must keep the recent
    // orphan (it could be a sibling tab's in-flight blob).
    await new Promise((r) => setTimeout(r, 30))
    expect(await s.get(recentOrphan)).not.toBeNull()
    expect(second.result.current.garments).toHaveLength(1)
  })

  it('skips the sweep when metadata is unavailable (corrupt), keeping even old orphans', async () => {
    const oldStore = createMemoryBlobStore(true, () => Date.now() - 2 * 60 * 60 * 1000)
    __setAssetBlobStoreForTests(oldStore)
    const oldOrphan = (await oldStore.put(new Blob(['old'], { type: 'image/webp' })))!
    // Corrupt metadata → loadGarmentsResult is 'unavailable' → the sweep is
    // skipped entirely, so even an old orphan is preserved (we can't be sure it
    // is unreferenced when the read failed).
    localStorage.setItem(STORAGE_KEYS.garments, '{ not valid json')

    const view = await renderArchive()
    // Timing-independent keep-invariant: a slow sweep can only delete, so this
    // can't flake. (Here the sweep is skipped entirely on the unavailable read,
    // so even an OLD orphan survives.)
    await new Promise((r) => setTimeout(r, 30))
    expect(view.result.current.garments).toHaveLength(0)
    expect(await oldStore.get(oldOrphan)).not.toBeNull()
  })

  it('fails closed when metadata loads as an ambiguous empty archive', async () => {
    const orphanOrPossiblyReferenced = (await store.put(
      new Blob(['unknown'], { type: 'image/webp' }),
    ))!

    const view = await renderArchive()
    await Promise.resolve()

    expect(view.result.current.garments).toHaveLength(0)
    expect(await store.get(orphanOrPossiblyReferenced)).not.toBeNull()
  })

  it('fails closed when the hydration key snapshot rejects', async () => {
    const key = (await store.put(new Blob(['keep'], { type: 'image/webp' })))!
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([
        makeGarment({
          asset: {
            originalImageUrl: 'data:thumb',
            displayImageUrl: '',
            cutoutImageRef: { kind: 'indexeddb-blob', key },
            assetMode: 'cutout',
          },
        }),
      ]),
    )
    __setAssetBlobStoreForTests({
      ...store,
      listKeys: async () => {
        throw new Error('key snapshot failed')
      },
    })

    const view = await renderArchive()
    await Promise.resolve()

    expect(view.result.current.garments).toHaveLength(1)
    expect(await store.get(key)).not.toBeNull()
  })

  it('a metadata save failure leaves the previously persisted archive intact', async () => {
    // Persist a garment, then make every subsequent metadata write throw.
    const { result } = await renderArchive()
    const s = await getAssetBlobStore()
    const draft = await blobBackDraftAsset(cutoutDraft(), s)
    act(() => {
      result.current.addGarment(draft)
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        'indexeddb-blob',
      ),
    )
    const persisted = localStorage.getItem(STORAGE_KEYS.garments)!

    // Now writes fail (e.g. quota). The adapter swallows the error; the prior
    // persisted state must remain readable and unchanged.
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })
    act(() => {
      result.current.addGarment({ ...cutoutDraft(), name: 'Doomed' })
    })
    await Promise.resolve()
    expect(localStorage.getItem(STORAGE_KEYS.garments)).toBe(persisted)
    setItem.mockRestore()
  })

  it('resetting the archive clears the blob store', async () => {
    const { result } = await renderArchive()
    const s = await getAssetBlobStore()
    const d = await blobBackDraftAsset(cutoutDraft(), s)
    const key = d.asset!.cutoutImageRef!.key
    act(() => {
      result.current.addGarment(d)
    })
    expect(await store.get(key)).not.toBeNull()

    act(() => result.current.resetArchive())
    await waitFor(async () => expect(await store.get(key)).toBeNull())
    expect(result.current.garments).toHaveLength(0)
  })

  it('deleting a saved outfit does NOT delete the garment or its blob', async () => {
    const { result } = await renderArchive()
    const s = await getAssetBlobStore()
    const d = await blobBackDraftAsset(cutoutDraft(), s)
    const key = d.asset!.cutoutImageRef!.key
    let id = ''
    let lookId = ''
    act(() => {
      id = result.current.addGarment(d).id
    })
    act(() => result.current.selectGarment(id))
    act(() => {
      lookId = result.current.saveOutfit('Look')!.id
    })
    act(() => result.current.removeOutfit(lookId))

    expect(result.current.garments.map((g) => g.id)).toEqual([id])
    expect(await store.get(key)).not.toBeNull() // blob survives
  })
})
