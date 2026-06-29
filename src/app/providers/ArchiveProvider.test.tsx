import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ArchiveProvider } from './ArchiveProvider'
import { useArchive } from './useArchive'
import { emptyGarmentDraft, garmentToDraft } from '../../domain/garmentDraft'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { createEmptyOutfit } from '../../domain/outfitTypes'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import { makeGarment } from '../../test/factories'
import type {
  ClothingCategory,
  GarmentDraft,
  GarmentItem,
} from '../../domain/garmentTypes'

// These tests drive the REAL provider over the REAL storage facade, which in
// jsdom resolves to the localStorage backend (no IndexedDB/canvas). This is the
// only place the action-creator layer (id/timestamp/event minting, the empty
// guard, category->slot routing) and the end-to-end reload guarantee are
// exercised — the reducer tests cannot reach the effects.

function wrapper({ children }: { children: ReactNode }) {
  return <ArchiveProvider>{children}</ArchiveProvider>
}

/** Render the store and wait for hydration. Mutating before this is unsafe:
 *  the persist effects are gated on `hydrated`, and a late HYDRATE would
 *  overwrite early writes. */
async function renderArchive() {
  const view = renderHook(() => useArchive(), { wrapper })
  await waitFor(() => expect(view.result.current.hydrated).toBe(true))
  return view
}

const draftOf = (
  category: ClothingCategory,
  extra: Partial<GarmentDraft> = {},
): GarmentDraft => ({
  ...emptyGarmentDraft('data:image/svg+xml,<svg/>'),
  name: `${category} piece`,
  category,
  ...extra,
})

describe('ArchiveProvider — action creators', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('addGarment mints a valid Archive Piece and records an event', async () => {
    const { result } = await renderArchive()

    let id = ''
    act(() => {
      const g = result.current.addGarment(draftOf('top', { name: 'Wool Tee' }))
      id = g.id
      expect(g.id).toMatch(/^grm_/)
      expect(typeof g.createdAt).toBe('number')
      expect(g.createdAt).toBe(g.updatedAt)
    })

    expect(result.current.garments[0]?.id).toBe(id)
    expect(result.current.garments[0]?.name).toBe('Wool Tee')
    expect(result.current.lastEvent?.type).toBe('garment_added')
  })

  it('addGarment carries the draft asset onto the new garment', async () => {
    const { result } = await renderArchive()
    let g: GarmentItem | undefined
    act(() => {
      g = result.current.addGarment({
        ...draftOf('top'),
        asset: {
          originalImageUrl: 'data:o',
          displayImageUrl: 'data:d',
          assetMode: 'product-reference',
        },
      })
    })
    expect(g?.asset?.assetMode).toBe('product-reference')
    expect(g?.asset?.displayImageUrl).toBe('data:d')
  })

  it('updateGarment preserves the asset across a metadata-only edit', async () => {
    const { result } = await renderArchive()
    let id = ''
    act(() => {
      id = result.current.addGarment({
        ...draftOf('top'),
        asset: {
          originalImageUrl: 'data:o',
          displayImageUrl: 'data:d',
          assetMode: 'product-reference',
        },
      }).id
    })
    // Edit via the real path: garmentToDraft → change name → updateGarment.
    act(() => {
      const g = result.current.getGarment(id)!
      result.current.updateGarment(id, { ...garmentToDraft(g), name: 'Renamed' })
    })
    const updated = result.current.getGarment(id)
    expect(updated?.name).toBe('Renamed')
    expect(updated?.asset?.displayImageUrl).toBe('data:d')
  })

  it('addGarment carries purchase metadata + provenance, and they survive a reload', async () => {
    const { result } = await renderArchive()
    let id = ''
    act(() => {
      id = result.current.addGarment(
        draftOf('outerwear', {
          name: 'Wool Overcoat',
          material: '100% wool',
          size: 'L',
          price: 320,
          currency: 'GBP',
          subtype: 'overcoat',
        }),
        { analysisConfidence: 0.82, analysisSource: 'mock', userEdited: true },
      ).id
    })
    const g = result.current.getGarment(id)
    expect(g?.material).toBe('100% wool')
    expect(g?.price).toBe(320)
    expect(g?.currency).toBe('GBP')
    expect(g?.analysisConfidence).toBe(0.82)
    expect(g?.analysisSource).toBe('mock')
    expect(g?.userEdited).toBe(true)

    // Reload over the same backend → fields persisted.
    const second = await renderArchive()
    const reloaded = second.result.current.getGarment(id)
    expect(reloaded?.material).toBe('100% wool')
    expect(reloaded?.price).toBe(320)
    expect(reloaded?.analysisSource).toBe('mock')
  })

  it('updateGarment marks the piece as user-edited', async () => {
    const { result } = await renderArchive()
    let id = ''
    act(() => {
      id = result.current.addGarment(draftOf('top', { name: 'Tee' })).id
    })
    expect(result.current.getGarment(id)?.userEdited).toBeUndefined()
    act(() => {
      const g = result.current.getGarment(id)!
      result.current.updateGarment(id, { ...garmentToDraft(g), size: 'M' })
    })
    const updated = result.current.getGarment(id)
    expect(updated?.size).toBe('M')
    expect(updated?.userEdited).toBe(true)
  })

  it('selectGarment routes a piece into its category slot for all five categories', async () => {
    const { result } = await renderArchive()
    const cats: ClothingCategory[] = [
      'outerwear',
      'top',
      'pants',
      'shoes',
      'accessory',
    ]
    const ids: Partial<Record<ClothingCategory, string>> = {}

    act(() => {
      for (const c of cats) ids[c] = result.current.addGarment(draftOf(c)).id
    })
    act(() => {
      for (const c of cats) result.current.selectGarment(ids[c]!)
    })
    for (const c of cats) expect(result.current.currentOutfit[c]).toBe(ids[c])

    // Selecting another top replaces only the top slot.
    let secondTop = ''
    act(() => {
      secondTop = result.current.addGarment(draftOf('top')).id
    })
    act(() => result.current.selectGarment(secondTop))
    expect(result.current.currentOutfit.top).toBe(secondTop)
    expect(result.current.currentOutfit.pants).toBe(ids.pants)

    // An unknown id is ignored.
    act(() => result.current.selectGarment('does-not-exist'))
    expect(result.current.currentOutfit.top).toBe(secondTop)
  })

  it('saveOutfit returns null and stores nothing when the outfit is empty', async () => {
    const { result } = await renderArchive()
    let saved: ReturnType<typeof result.current.saveOutfit> = null
    act(() => {
      saved = result.current.saveOutfit('Nope')
    })
    expect(saved).toBeNull()
    expect(result.current.savedOutfits).toHaveLength(0)
  })

  it('saveOutfit snapshots the outfit with a fallback name and cover hue', async () => {
    const { result } = await renderArchive()
    let topId = ''
    act(() => {
      topId = result.current.addGarment(draftOf('top', { colorHex: '#23303f' })).id
    })
    act(() => result.current.selectGarment(topId))

    let saved: ReturnType<typeof result.current.saveOutfit> = null
    act(() => {
      saved = result.current.saveOutfit('   ')
    })
    expect(saved).not.toBeNull()
    expect(saved!.id).toMatch(/^look_/)
    expect(saved!.name).toBe('Untitled Look')
    expect(saved!.coverHex).toBe('#23303f')
    expect(saved!.selection.top).toBe(topId)
    expect(result.current.savedOutfits).toHaveLength(1)
  })

  it('restore / remove keep the selection and saved list consistent', async () => {
    const { result } = await renderArchive()
    let topId = ''
    let pantsId = ''
    act(() => {
      topId = result.current.addGarment(draftOf('top')).id
      pantsId = result.current.addGarment(draftOf('pants')).id
    })
    act(() => {
      result.current.selectGarment(topId)
      result.current.selectGarment(pantsId)
    })
    let lookId = ''
    act(() => {
      lookId = result.current.saveOutfit('Look 1')!.id
    })

    act(() => result.current.clearOutfit())
    expect(result.current.currentOutfit.top).toBeNull()

    act(() => result.current.restoreOutfit(lookId))
    expect(result.current.currentOutfit.top).toBe(topId)
    expect(result.current.currentOutfit.pants).toBe(pantsId)

    // Removing a selected garment clears its slot but leaves others intact.
    act(() => result.current.removeGarment(topId))
    expect(result.current.currentOutfit.top).toBeNull()
    expect(result.current.currentOutfit.pants).toBe(pantsId)

    act(() => result.current.removeOutfit(lookId))
    expect(result.current.savedOutfits).toHaveLength(0)

    // updateGarment on an unknown id is a no-op.
    const count = result.current.garments.length
    act(() => result.current.updateGarment('nope', draftOf('top')))
    expect(result.current.garments).toHaveLength(count)
  })

  it('deleting a saved look removes the look but keeps every garment', async () => {
    const { result } = await renderArchive()
    let topId = ''
    let pantsId = ''
    act(() => {
      topId = result.current.addGarment(draftOf('top')).id
      pantsId = result.current.addGarment(draftOf('pants')).id
    })
    act(() => {
      result.current.selectGarment(topId)
      result.current.selectGarment(pantsId)
    })
    let lookId = ''
    act(() => {
      lookId = result.current.saveOutfit('Look 1')!.id
    })
    expect(result.current.savedOutfits).toHaveLength(1)

    act(() => result.current.removeOutfit(lookId))
    expect(result.current.savedOutfits).toHaveLength(0)
    // Deleting a look must never delete clothes from the archive.
    expect(result.current.garments.map((g) => g.id).sort()).toEqual(
      [topId, pantsId].sort(),
    )
  })
})

describe('ArchiveProvider — market value', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('records an estimate, inheriting the garment currency, and survives a reload', async () => {
    const first = await renderArchive()
    let id = ''
    act(() => {
      id = first.result.current.addGarment(
        draftOf('top', { name: 'Resale Tee', price: 100, currency: 'USD' }),
      ).id
    })
    act(() => first.result.current.recordMarketValue(id, 140))

    const g = first.result.current.getGarment(id)
    expect(g?.marketValueHistory).toHaveLength(1)
    expect(g?.marketValueHistory?.[0]).toMatchObject({ value: 140, currency: 'USD' })
    expect(g?.marketValueHistory?.[0].id).toMatch(/^mkt_/)
    expect(typeof g?.marketValueHistory?.[0].at).toBe('number')
    expect(first.result.current.lastEvent?.type).toBe('garment_updated')

    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        'marketValueHistory',
      ),
    )
    first.unmount()

    // Reload over the same backend → the history persisted.
    const second = await renderArchive()
    const reloaded = second.result.current.getGarment(id)
    expect(reloaded?.marketValueHistory).toHaveLength(1)
    expect(reloaded?.marketValueHistory?.[0]).toMatchObject({
      value: 140,
      currency: 'USD',
    })
  })

  it('appends in order and lets an explicit currency override the inherited one', async () => {
    const { result } = await renderArchive()
    let id = ''
    act(() => {
      id = result.current.addGarment(
        draftOf('top', { price: 100, currency: 'USD' }),
      ).id
    })
    // Separate acts: each record is its own user interaction, so a re-render
    // flushes between them and the second appends to fresh state.
    act(() => result.current.recordMarketValue(id, 120))
    act(() => result.current.recordMarketValue(id, 130, 'EUR'))
    const history = result.current.getGarment(id)?.marketValueHistory
    expect(history?.map((e) => e.value)).toEqual([120, 130])
    expect(history?.[0].currency).toBe('USD') // inherited
    expect(history?.[1].currency).toBe('EUR') // overridden
  })

  it('ignores a non-finite value and an unknown id', async () => {
    const { result } = await renderArchive()
    let id = ''
    act(() => {
      id = result.current.addGarment(draftOf('top')).id
    })
    act(() => {
      result.current.recordMarketValue(id, Number.NaN)
      result.current.recordMarketValue(id, Number.POSITIVE_INFINITY)
      result.current.recordMarketValue('does-not-exist', 50)
    })
    expect(result.current.getGarment(id)?.marketValueHistory).toBeUndefined()
  })

  it('a metadata edit via updateGarment preserves the recorded history', async () => {
    // Locks the invariant that marketValueHistory is excluded from GarmentDraft,
    // so {...existing, ...draft} keeps it.
    const { result } = await renderArchive()
    let id = ''
    act(() => {
      id = result.current.addGarment(draftOf('top', { name: 'Keepme' })).id
    })
    act(() => result.current.recordMarketValue(id, 200))
    act(() => {
      const g = result.current.getGarment(id)!
      result.current.updateGarment(id, { ...garmentToDraft(g), name: 'Renamed' })
    })
    const updated = result.current.getGarment(id)
    expect(updated?.name).toBe('Renamed')
    expect(updated?.marketValueHistory?.map((e) => e.value)).toEqual([200])
  })
})

describe('ArchiveProvider — persistence across a reload', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('garments, the saved look and the current outfit all survive a reload', async () => {
    // Lifecycle 1: build state, then "close the tab".
    const first = await renderArchive()
    let topId = ''
    let pantsId = ''
    act(() => {
      topId = first.result.current.addGarment(draftOf('top')).id
      pantsId = first.result.current.addGarment(draftOf('pants')).id
    })
    act(() => {
      first.result.current.selectGarment(topId)
      first.result.current.selectGarment(pantsId)
    })
    act(() => {
      first.result.current.saveOutfit('Look 1')
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.savedOutfits)).toContain('Look 1'),
    )
    first.unmount()

    // Lifecycle 2: a fresh provider over the same localStorage = a reload.
    const second = await renderArchive()
    expect(second.result.current.garments.map((g) => g.id).sort()).toEqual(
      [topId, pantsId].sort(),
    )
    expect(second.result.current.savedOutfits).toHaveLength(1)
    expect(second.result.current.savedOutfits[0]?.selection.top).toBe(topId)
    expect(second.result.current.currentOutfit.top).toBe(topId)
    expect(second.result.current.currentOutfit.pants).toBe(pantsId)
  })

  it('drops a current-outfit reference to a garment that is gone after reload', async () => {
    // Stored state references a top 'A' that is no longer in the garments list.
    const pants = makeGarment({ id: 'B', category: 'pants' })
    localStorage.setItem(STORAGE_KEYS.garments, JSON.stringify([pants]))
    localStorage.setItem(
      STORAGE_KEYS.currentOutfit,
      JSON.stringify({ ...createEmptyOutfit(), top: 'A', pants: 'B' }),
    )

    const { result } = await renderArchive()
    expect(result.current.currentOutfit.top).toBeNull() // dangling 'A' dropped
    expect(result.current.currentOutfit.pants).toBe('B') // valid 'B' kept
  })

  it('Case A — an accepted cutout survives a reload (mode + display + helper + outfit refs)', async () => {
    // Lifecycle 1: archive a garment whose accepted cutout is the display, then
    // select it and save a look so the outfit references travel the reload too.
    const first = await renderArchive()
    let id = ''
    act(() => {
      id = first.result.current.addGarment({
        ...draftOf('top', { name: 'Cutout Tee' }),
        asset: {
          originalImageUrl: 'data:o',
          cutoutImageUrl: 'data:cutout',
          displayImageUrl: 'data:cutout',
          assetMode: 'cutout',
        },
      }).id
    })
    act(() => first.result.current.selectGarment(id))
    act(() => {
      first.result.current.saveOutfit('Cutout Look')
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        '"assetMode":"cutout"',
      ),
    )
    first.unmount()

    // Lifecycle 2 (reload): the cutout is intact and still what renders.
    const second = await renderArchive()
    const g = second.result.current.getGarment(id)!
    expect(g.asset?.assetMode).toBe('cutout')
    expect(g.asset?.displayImageUrl).toBe('data:cutout')
    expect(g.asset?.cutoutImageUrl).toBe('data:cutout')
    expect(getGarmentDisplayImage(g)).toBe('data:cutout')
    // Outfit references still resolve to the garment after reload.
    expect(second.result.current.currentOutfit.top).toBe(id)
    expect(second.result.current.savedOutfits[0]?.selection.top).toBe(id)
  })

  it('Case B — a product-reference display is NOT shadowed by a stored cutout after reload', async () => {
    // Lifecycle 1: archive a garment that has BOTH a stored cutout AND a chosen
    // product-reference display (the discriminating precedence case).
    const first = await renderArchive()
    let id = ''
    act(() => {
      id = first.result.current.addGarment({
        ...draftOf('outerwear', { name: 'Ref Coat' }),
        asset: {
          originalImageUrl: 'data:o',
          displayImageUrl: 'data:ref',
          productReferenceImageUrl: 'data:ref',
          cutoutImageUrl: 'data:cutout', // a stored-but-not-chosen cutout
          assetMode: 'product-reference',
        },
      }).id
    })
    act(() => first.result.current.selectGarment(id))
    act(() => {
      first.result.current.saveOutfit('Ref Look')
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.garments)).toContain(
        '"assetMode":"product-reference"',
      ),
    )
    first.unmount()

    // Lifecycle 2 (reload): the reference still wins; the stale cutout is stored
    // but never shadows the user's chosen display.
    const second = await renderArchive()
    const g = second.result.current.getGarment(id)!
    expect(g.asset?.assetMode).toBe('product-reference')
    expect(g.asset?.displayImageUrl).toBe('data:ref')
    expect(g.asset?.cutoutImageUrl).toBe('data:cutout') // still persisted
    expect(getGarmentDisplayImage(g)).toBe('data:ref') // NOT the cutout
    expect(second.result.current.currentOutfit.outerwear).toBe(id)
    expect(second.result.current.savedOutfits[0]?.selection.outerwear).toBe(id)
  })

  it('never clobbers a pre-seeded store with the empty initial state', async () => {
    const seed = makeGarment({ id: 'seed', category: 'top' })
    localStorage.setItem(STORAGE_KEYS.garments, JSON.stringify([seed]))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    const { result } = await renderArchive()

    // The seed loaded...
    expect(result.current.garments.map((g) => g.id)).toEqual(['seed'])
    // ...and the hydration gate prevented any empty-array write to the
    // garments key (which would have wiped the seed before HYDRATE resolved).
    const emptyWrites = setItem.mock.calls.filter(
      (call) => call[0] === STORAGE_KEYS.garments && call[1] === '[]',
    )
    expect(emptyWrites).toEqual([])
    setItem.mockRestore()
  })
})
