// Persistence acknowledgement, end to end through the provider.
//
// The behaviour under test is the one the audit flagged: a rejected write used
// to be swallowed by `void adapter.saveGarments(...)`, so the UI kept implying
// the archive was safe. These tests drive a real provider against a storage
// adapter that fails, and assert the failure reaches consumers.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { GarmentDraft } from '../../domain/garmentTypes'
import { createEmptyOutfit } from '../../domain/outfitTypes'
import type {
  ArchiveStorageAdapter,
  StorageBackend,
} from '../../lib/storage/storageTypes'
import * as archiveStorage from '../../lib/storage/archiveStorage'
import { ArchiveProvider } from './ArchiveProvider'
import { useArchive } from './useArchive'

const wrapper = ({ children }: { children: ReactNode }) => (
  <ArchiveProvider>{children}</ArchiveProvider>
)

const DRAFT: GarmentDraft = {
  name: 'Wool Coat',
  category: 'outerwear',
  color: 'Charcoal',
  colorHex: '#2b2b30',
  styleTags: ['minimal'],
  imageDataUrl: 'data:image/svg+xml,<svg/>',
}

/** An adapter whose garment writes reject, everything else succeeds. */
function makeAdapter(
  overrides: Partial<ArchiveStorageAdapter> = {},
  backend: StorageBackend = 'localstorage',
): ArchiveStorageAdapter {
  return {
    backend,
    loadGarments: async () => [],
    loadGarmentsResult: async () => ({ status: 'ok', garments: [] }),
    saveGarments: async () => {},
    loadSavedOutfits: async () => [],
    saveSavedOutfits: async () => {},
    loadCurrentOutfit: async () => createEmptyOutfit(),
    saveCurrentOutfit: async () => {},
    clearAll: async () => {},
    ...overrides,
  }
}

function useAdapter(adapter: ArchiveStorageAdapter) {
  vi.spyOn(archiveStorage, 'getArchiveStorage').mockResolvedValue(adapter)
}

describe('ArchiveProvider — persistence acknowledgement', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('acknowledges a durable write instead of leaving the user guessing', async () => {
    useAdapter(makeAdapter())
    const { result } = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => {
      result.current.addGarment(DRAFT)
    })

    await waitFor(() => expect(result.current.persistence.status).toBe('saved'))
    expect(result.current.persistence.lastSavedAt).toBeGreaterThan(0)
    expect(result.current.persistence.lastError).toBeNull()
  })

  it('surfaces a rejected write rather than swallowing it', async () => {
    useAdapter(
      makeAdapter({
        saveGarments: async () => {
          throw new Error('QuotaExceededError')
        },
      }),
    )
    const { result } = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => {
      result.current.addGarment(DRAFT)
    })

    await waitFor(() => expect(result.current.persistence.status).toBe('failed'))
    expect(result.current.persistence.lastError).toBe('QuotaExceededError')

    // The optimistic update still stands — the user's work is not thrown away,
    // they are just told it may not have been stored.
    expect(result.current.garments).toHaveLength(1)
  })

  it('reports an in-memory store as degraded, never as saved', async () => {
    useAdapter(makeAdapter({}, 'memory'))
    const { result } = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => {
      result.current.addGarment(DRAFT)
    })

    await waitFor(() =>
      expect(result.current.persistence.lastSavedAt).toBeGreaterThan(0),
    )
    expect(result.current.persistence.status).toBe('degraded')
  })

  it('recovers once the store starts answering again', async () => {
    let failNext = true
    useAdapter(
      makeAdapter({
        saveGarments: async () => {
          if (failNext) {
            failNext = false
            throw new Error('transient')
          }
        },
      }),
    )
    const { result } = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => {
      result.current.addGarment(DRAFT)
    })
    await waitFor(() => expect(result.current.persistence.status).toBe('failed'))

    act(() => {
      result.current.addGarment({ ...DRAFT, name: 'Second Coat' })
    })
    await waitFor(() => expect(result.current.persistence.status).toBe('saved'))
    expect(result.current.persistence.lastError).toBeNull()
  })
})
