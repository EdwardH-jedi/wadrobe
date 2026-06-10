import { beforeEach, describe, expect, it } from 'vitest'
import {
  createArchiveStorage,
  createMemoryAdapter,
  getArchiveStorage,
} from './archiveStorage'
import { makeGarment } from '../../test/factories'
import { createEmptyOutfit, type SavedOutfit } from '../../domain/outfitTypes'

const look: SavedOutfit = {
  id: 'look-1',
  name: 'Test Look',
  selection: { ...createEmptyOutfit(), top: 'a' },
  createdAt: 1_700_000_000_000,
  coverHex: '#2b2b30',
}

// The in-memory adapter is the last-resort backend (private mode, no storage).
// It was previously untested even though the app silently relies on it.
describe('createMemoryAdapter', () => {
  it('reports the memory backend and starts empty', async () => {
    const adapter = createMemoryAdapter()
    expect(adapter.backend).toBe('memory')
    expect(await adapter.loadGarments()).toEqual([])
    expect(await adapter.loadSavedOutfits()).toEqual([])
    expect(await adapter.loadCurrentOutfit()).toBeNull()
  })

  it('round-trips garments, saved outfits and the current outfit', async () => {
    const adapter = createMemoryAdapter()
    await adapter.saveGarments([makeGarment({ id: 'a' })])
    await adapter.saveSavedOutfits([look])
    await adapter.saveCurrentOutfit({ ...createEmptyOutfit(), top: 'a' })

    expect((await adapter.loadGarments()).map((g) => g.id)).toEqual(['a'])
    expect(await adapter.loadSavedOutfits()).toHaveLength(1)
    expect((await adapter.loadCurrentOutfit())?.top).toBe('a')
  })

  it('clearAll resets every collection', async () => {
    const adapter = createMemoryAdapter()
    await adapter.saveGarments([makeGarment({ id: 'a' })])
    await adapter.saveSavedOutfits([look])
    await adapter.saveCurrentOutfit({ ...createEmptyOutfit(), top: 'a' })
    await adapter.clearAll()

    expect(await adapter.loadGarments()).toEqual([])
    expect(await adapter.loadSavedOutfits()).toEqual([])
    expect(await adapter.loadCurrentOutfit()).toBeNull()
  })
})

describe('storage facade', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('selects the localStorage backend in jsdom (IndexedDB is absent there)', async () => {
    // jsdom implements neither IndexedDB nor canvas, so the selection order
    // IndexedDB -> localStorage -> memory resolves to localStorage. This is the
    // same path the <App/> and provider tests exercise.
    const adapter = await createArchiveStorage()
    expect(adapter.backend).toBe('localstorage')
  })

  it('getArchiveStorage memoizes a single adapter promise', () => {
    expect(getArchiveStorage()).toBe(getArchiveStorage())
  })
})
