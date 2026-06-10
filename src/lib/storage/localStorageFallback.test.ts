import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalStorageAdapter } from './localStorageFallback'
import { STORAGE_KEYS } from './storageTypes'
import { makeGarment } from '../../test/factories'
import { createEmptyOutfit } from '../../domain/outfitTypes'
import type { SavedOutfit } from '../../domain/outfitTypes'

describe('localStorage storage adapter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips garments', async () => {
    const adapter = createLocalStorageAdapter()
    const garments = [
      makeGarment({ id: 'a', name: 'Coat', category: 'outerwear' }),
      makeGarment({ id: 'b', name: 'Tee', category: 'top' }),
    ]
    await adapter.saveGarments(garments)

    const loaded = await adapter.loadGarments()
    expect(loaded).toHaveLength(2)
    expect(loaded.map((g) => g.id)).toEqual(['a', 'b'])
  })

  it('loadGarmentsResult distinguishes ok-with-garments, ok-empty, and unavailable', async () => {
    const adapter = createLocalStorageAdapter()

    // Absent key → a genuine empty archive (ok, []).
    let result = await adapter.loadGarmentsResult()
    expect(result.status).toBe('ok')
    expect(result.garments).toEqual([])

    // Saved garments → ok with content.
    await adapter.saveGarments([makeGarment({ id: 'a' })])
    result = await adapter.loadGarmentsResult()
    expect(result.status).toBe('ok')
    expect(result.garments.map((g) => g.id)).toEqual(['a'])

    // Corrupt JSON → unavailable (NOT silently normalized to an empty archive,
    // which would let the orphan sweep delete still-referenced blobs).
    localStorage.setItem(STORAGE_KEYS.garments, '{ not json')
    result = await adapter.loadGarmentsResult()
    expect(result.status).toBe('unavailable')
    expect(result.garments).toEqual([])
    // loadGarments stays single-sourced (returns the same garments).
    expect(await adapter.loadGarments()).toEqual([])
  })

  it('round-trips saved outfits and the current outfit', async () => {
    const adapter = createLocalStorageAdapter()
    const look: SavedOutfit = {
      id: 'look-1',
      name: 'Test Look',
      selection: { ...createEmptyOutfit(), top: 'a' },
      createdAt: 1_700_000_000_000,
      coverHex: '#2b2b30',
    }
    await adapter.saveSavedOutfits([look])
    await adapter.saveCurrentOutfit({ ...createEmptyOutfit(), top: 'a' })

    expect(await adapter.loadSavedOutfits()).toHaveLength(1)
    const current = await adapter.loadCurrentOutfit()
    expect(current?.top).toBe('a')
  })

  it('clears all archive data', async () => {
    const adapter = createLocalStorageAdapter()
    await adapter.saveGarments([makeGarment({ id: 'a' })])
    await adapter.clearAll()
    expect(await adapter.loadGarments()).toEqual([])
  })

  it('returns safe defaults when stored data is corrupt', async () => {
    const adapter = createLocalStorageAdapter()
    localStorage.setItem(STORAGE_KEYS.garments, 'not-json{{{')
    expect(await adapter.loadGarments()).toEqual([])
  })

  it('drops entries that do not look like garments', async () => {
    const adapter = createLocalStorageAdapter()
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([makeGarment({ id: 'ok' }), { junk: true }]),
    )
    const loaded = await adapter.loadGarments()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('ok')
  })

  it('drops incomplete garments that would crash rendering', async () => {
    const adapter = createLocalStorageAdapter()
    localStorage.setItem(
      STORAGE_KEYS.garments,
      JSON.stringify([{ id: 'bad', name: 'X', category: 'top', imageDataUrl: 'd' }]),
    )
    expect(await adapter.loadGarments()).toEqual([])
  })

  it('normalizes partial saved-look selections during hydration', async () => {
    const adapter = createLocalStorageAdapter()
    localStorage.setItem(
      STORAGE_KEYS.savedOutfits,
      JSON.stringify([
        {
          id: 'look-1',
          name: 'Partial',
          selection: { top: 'a', pants: 42 },
          createdAt: 1_700_000_000_000,
          coverHex: '#222222',
        },
      ]),
    )

    const [look] = await adapter.loadSavedOutfits()
    expect(look.selection).toEqual({ ...createEmptyOutfit(), top: 'a' })
  })

  it('returns null for the current outfit when nothing is stored', async () => {
    const adapter = createLocalStorageAdapter()
    expect(await adapter.loadCurrentOutfit()).toBeNull()
  })

  it('distinguishes a stored empty outfit (object of nulls) from absent (null)', async () => {
    const adapter = createLocalStorageAdapter()
    await adapter.saveCurrentOutfit(createEmptyOutfit())
    expect(await adapter.loadCurrentOutfit()).toEqual(createEmptyOutfit())
  })

  it('clearAll removes saved outfits and the current outfit too', async () => {
    const adapter = createLocalStorageAdapter()
    await adapter.saveGarments([makeGarment({ id: 'a' })])
    await adapter.saveSavedOutfits([
      {
        id: 'l',
        name: 'L',
        selection: createEmptyOutfit(),
        createdAt: 1,
        coverHex: '#000000',
      },
    ])
    await adapter.saveCurrentOutfit({ ...createEmptyOutfit(), top: 'a' })
    await adapter.clearAll()

    expect(await adapter.loadSavedOutfits()).toEqual([])
    expect(await adapter.loadCurrentOutfit()).toBeNull()
  })

  it('is resilient to corrupt JSON in the saved-outfit and current-outfit keys', async () => {
    const adapter = createLocalStorageAdapter()
    localStorage.setItem(STORAGE_KEYS.savedOutfits, 'not-json{{{')
    localStorage.setItem(STORAGE_KEYS.currentOutfit, '@@@')
    expect(await adapter.loadSavedOutfits()).toEqual([])
    expect(await adapter.loadCurrentOutfit()).toBeNull()
  })

  it('persists across a new adapter instance (a reload over the same localStorage)', async () => {
    const writer = createLocalStorageAdapter()
    await writer.saveGarments([
      makeGarment({ id: 'a' }),
      makeGarment({ id: 'b' }),
    ])
    await writer.saveSavedOutfits([
      {
        id: 'l',
        name: 'L',
        selection: { ...createEmptyOutfit(), top: 'a' },
        createdAt: 1,
        coverHex: '#000000',
      },
    ])
    await writer.saveCurrentOutfit({ ...createEmptyOutfit(), top: 'a' })

    // A fresh adapter reading the same backing store models a page reload.
    const reader = createLocalStorageAdapter()
    expect((await reader.loadGarments()).map((g) => g.id)).toEqual(['a', 'b'])
    const [saved] = await reader.loadSavedOutfits()
    expect(saved.selection.top).toBe('a')
    expect((await reader.loadCurrentOutfit())?.top).toBe('a')
  })

  it('round-trips garments with and without an asset (Phase 8 backward compat)', async () => {
    const adapter = createLocalStorageAdapter()
    const withAsset = makeGarment({
      id: 'a',
      asset: {
        originalImageUrl: 'data:o',
        displayImageUrl: 'data:o',
        assetMode: 'uploaded',
      },
    })
    const legacy = makeGarment({ id: 'b' }) // pre-Phase-8 shape: no asset
    await adapter.saveGarments([withAsset, legacy])

    const loaded = await adapter.loadGarments()
    expect(loaded.map((g) => g.id)).toEqual(['a', 'b'])
    expect(loaded[0].asset?.assetMode).toBe('uploaded')
    expect(loaded[1].asset).toBeUndefined()
  })
})
