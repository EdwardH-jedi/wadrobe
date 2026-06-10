// B3.9: attaching/removing a proxy 3D preview link via the provider, and
// its survival across a real (localStorage-backed) reload.
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type {
  GarmentDraft,
  GarmentItem,
  GarmentProxy3dPreview,
} from '../../domain/garmentTypes'
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

const PREVIEW: GarmentProxy3dPreview = {
  jobId: 'b'.repeat(32),
  generatedAt: 1_750_000_000_000,
  mode: 'single-sided',
  method: 'extruded-alpha-contour',
  frontAlphaMaskUsed: true,
  vertexCount: 2552,
  faceCount: 5100,
  limitations: 'Proxy 3D preview only.',
}

describe('ArchiveProvider — proxy 3D preview link (B3.9)', () => {
  beforeEach(() => localStorage.clear())

  it('attaches, persists across reload, and removes the link', async () => {
    const first = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(first.result.current.hydrated).toBe(true))

    let garment: GarmentItem | undefined
    act(() => {
      garment = first.result.current.addGarment(DRAFT)
    })
    expect(garment).toBeDefined()
    const id = garment!.id

    // Attach.
    act(() => {
      first.result.current.setGarmentProxy3dPreview(id, PREVIEW)
    })
    expect(first.result.current.getGarment(id)?.proxy3dPreview).toEqual(
      PREVIEW,
    )

    // Persisted (fire-and-forget save → poll the store).
    await waitFor(() => {
      const raw = localStorage.getItem('fitarchive:garments')
      expect(raw).toContain(PREVIEW.jobId)
    })
    first.unmount()

    // A fresh provider (simulated reload) hydrates the link back.
    const second = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(second.result.current.hydrated).toBe(true))
    expect(second.result.current.getGarment(id)?.proxy3dPreview).toEqual(
      PREVIEW,
    )

    // Remove the link only — the garment itself stays.
    act(() => {
      second.result.current.setGarmentProxy3dPreview(id, null)
    })
    const after = second.result.current.getGarment(id)
    expect(after).toBeDefined()
    expect(after?.proxy3dPreview).toBeUndefined()
    await waitFor(() => {
      const raw = localStorage.getItem('fitarchive:garments')
      expect(raw).not.toContain(PREVIEW.jobId)
    })
    second.unmount()
  })

  it('editing a garment preserves an attached preview link', async () => {
    const { result, unmount } = renderHook(() => useArchive(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    let garment: GarmentItem | undefined
    act(() => {
      garment = result.current.addGarment(DRAFT)
    })
    const id = garment!.id
    act(() => {
      result.current.setGarmentProxy3dPreview(id, PREVIEW)
    })
    act(() => {
      result.current.updateGarment(id, { ...DRAFT, name: 'Renamed Coat' })
    })
    const updated = result.current.getGarment(id)
    expect(updated?.name).toBe('Renamed Coat')
    expect(updated?.proxy3dPreview).toEqual(PREVIEW)
    unmount()
  })
})
