// Corrupted persisted data must degrade, not disappear.
//
// The app re-persists the WHOLE garments array on the next edit. So an entry
// dropped at load is not merely hidden — it is erased a moment later, by a
// perfectly ordinary user action, with nothing said. These tests pin the two
// halves of the answer: the app keeps working, AND it reports the loss while it
// is still recoverable from a backup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { useArchive } from '../../app/providers/useArchive'
import { makeGarment } from '../../test/factories'
import {
  __setAssetBlobStoreForTests,
  createMemoryBlobStore,
} from './assetBlobStore'
import {
  createLocalStorageAdapter,
} from './localStorageFallback'
import { STORAGE_KEYS, parseGarmentsWithReport } from './storageTypes'

const wrapper = ({ children }: { children: ReactNode }) => (
  <ArchiveProvider>{children}</ArchiveProvider>
)

describe('parseGarmentsWithReport', () => {
  it('counts every entry it had to discard', () => {
    const good = makeGarment()
    const result = parseGarmentsWithReport([
      good,
      null,
      { id: 'x' }, // missing everything else
      { ...good, category: 'hovercraft' }, // not a real category
      'not an object',
    ])
    expect(result.garments).toHaveLength(1)
    expect(result.garments[0].id).toBe(good.id)
    expect(result.unreadable).toBe(4)
  })

  it('reports nothing for an absent or empty archive', () => {
    expect(parseGarmentsWithReport(null)).toEqual({
      garments: [],
      unreadable: 0,
    })
    expect(parseGarmentsWithReport([])).toEqual({ garments: [], unreadable: 0 })
  })

  it('treats a stored non-array as one unreadable record, not as empty', () => {
    // Hand-edited storage, or a half-finished write. "Empty archive" would be a
    // lie, and the lie is what makes the next save destructive.
    expect(parseGarmentsWithReport({ nope: true }).unreadable).toBe(1)
  })

  it('keeps a garment whose OPTIONAL fields are corrupt', () => {
    // Repair-in-place beats discard whenever the piece can still be rendered.
    const result = parseGarmentsWithReport([
      makeGarment({
        brand: 42 as unknown as string,
        price: 'lots' as unknown as number,
        marketValueHistory: [{ nonsense: true }] as never,
      }),
    ])
    expect(result.unreadable).toBe(0)
    expect(result.garments).toHaveLength(1)
    expect(result.garments[0].brand).toBeUndefined()
    expect(result.garments[0].price).toBeUndefined()
    expect(result.garments[0].marketValueHistory).toEqual([])
  })
})

describe('the localStorage adapter reports what it could not read', () => {
  beforeEach(() => localStorage.clear())

  it('carries the count out of the read', async () => {
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([makeGarment(), { broken: true }, null]),
    )
    const result = await createLocalStorageAdapter().loadGarmentsResult()
    expect(result.status).toBe('ok')
    expect(result.garments).toHaveLength(1)
    expect(result.unreadable).toBe(2)
  })

  it('reports an unreadable JSON blob as unavailable, not as an empty archive', async () => {
    localStorage.setItem(STORAGE_KEYS.garments, '{{{ not json')
    const result = await createLocalStorageAdapter().loadGarmentsResult()
    expect(result.status).toBe('unavailable')
    expect(result.garments).toEqual([])
  })
})

describe('the app on top of a partly-corrupt archive', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => __setAssetBlobStoreForTests(null))

  it('still opens, showing the readable pieces and naming the loss', async () => {
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([
        makeGarment({ id: 'grm-ok', name: 'Readable' }),
        { id: 'grm-bad' },
        { id: 'grm-worse', category: 'top' },
      ]),
    )

    const tab = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(tab.result.current.hydrated).toBe(true))

    // The app is usable — corrupt storage does not take the whole archive down.
    expect(tab.result.current.garments).toHaveLength(1)
    expect(tab.result.current.garments[0].name).toBe('Readable')
    // ...and the loss is not swallowed.
    expect(tab.result.current.unreadableGarments).toBe(2)
  })

  it('does not mistake an UNREADABLE archive for an empty one', async () => {
    // The most destructive load there is, and the one that looks most innocent:
    // the stored blob is unparseable, so the app hydrates empty, `unreadable` is
    // 0 (there were no entries to count), and without this flag the screen is
    // indistinguishable from a first visit. The user adds one piece and the
    // whole archive is overwritten.
    const store = createMemoryBlobStore(true)
    const listKeys = vi.spyOn(store, 'listKeys')
    __setAssetBlobStoreForTests(store)

    localStorage.setItem(STORAGE_KEYS.garments, '{{{ not json')
    const tab = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(tab.result.current.hydrated).toBe(true))

    expect(tab.result.current.garments).toEqual([])
    expect(tab.result.current.storeUnreadable).toBe(true)
    // Nothing is swept either: the reference set is empty and untrustworthy.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listKeys).not.toHaveBeenCalled()
  })

  it('does not sweep blobs against a reference set it knows is incomplete', async () => {
    // The orphan sweep asks "which stored blobs is nothing pointing at?". When
    // records failed to parse, the answer is wrong by exactly those records —
    // and sweeping would delete the bytes the banner is telling the user to go
    // and rescue. The safe move is to skip the sweep, not to guess.
    const store = createMemoryBlobStore(true)
    const listKeys = vi.spyOn(store, 'listKeys')
    const del = vi.spyOn(store, 'delete')
    __setAssetBlobStoreForTests(store)

    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([makeGarment(), { broken: true }]),
    )
    const tab = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(tab.result.current.hydrated).toBe(true))
    expect(tab.result.current.unreadableGarments).toBe(1)

    // Give the fire-and-forget sweep every chance to run.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listKeys).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('still sweeps when every record read cleanly', async () => {
    const store = createMemoryBlobStore(true)
    const listKeys = vi.spyOn(store, 'listKeys')
    __setAssetBlobStoreForTests(store)

    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([makeGarment()]),
    )
    const tab = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(tab.result.current.hydrated).toBe(true))
    await waitFor(() => expect(listKeys).toHaveBeenCalled())
  })

  it('stops warning once a backup has been imported over it', async () => {
    // The warning's whole content is "import a backup before you edit". Leaving
    // it up after the user has done exactly that trains them to ignore it.
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([makeGarment(), { broken: true }]),
    )
    const tab = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(tab.result.current.hydrated).toBe(true))
    expect(tab.result.current.unreadableGarments).toBe(1)

    act(() => {
      tab.result.current.importArchive(
        {
          garments: [makeGarment({ id: 'grm-restored', name: 'Restored' })],
          savedOutfits: [],
          warnings: [],
        } as never,
        'replace',
      )
    })
    expect(tab.result.current.unreadableGarments).toBe(0)
  })

  it('says nothing when everything read cleanly', async () => {
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([makeGarment(), makeGarment()]),
    )
    const tab = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(tab.result.current.hydrated).toBe(true))
    expect(tab.result.current.unreadableGarments).toBe(0)
    expect(tab.result.current.storeUnreadable).toBe(false)
  })
})
