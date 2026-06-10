// B3.9: persistence + parser tolerance for the optional proxy3dPreview link.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GarmentProxy3dPreview } from '../../domain/garmentTypes'
import { makeGarment } from '../../test/factories'
import { createLocalStorageAdapter } from './localStorageFallback'
import { STORAGE_KEYS, parseGarments } from './storageTypes'

const PREVIEW: GarmentProxy3dPreview = {
  jobId: 'a'.repeat(32),
  generatedAt: 1_750_000_000_000,
  mode: 'dual-sided',
  method: 'extruded-alpha-contour-dual',
  frontAlphaMaskUsed: true,
  backAlphaMaskUsed: true,
  vertexCount: 5104,
  faceCount: 5100,
  limitations: 'Proxy 3D preview only.',
}

describe('proxy3dPreview persistence (B3.9)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('old records without proxy3dPreview parse cleanly', () => {
    const legacy = makeGarment()
    expect('proxy3dPreview' in legacy).toBe(false)
    const parsed = parseGarments([legacy])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].proxy3dPreview).toBeUndefined()
  })

  it('a valid preview link round-trips through the storage adapter', async () => {
    const adapter = createLocalStorageAdapter()
    const garment = makeGarment({ proxy3dPreview: PREVIEW })
    await adapter.saveGarments([garment])

    const loaded = await adapter.loadGarments()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].proxy3dPreview).toEqual(PREVIEW)
  })

  it('preview removal round-trips (link gone after save/load)', async () => {
    const adapter = createLocalStorageAdapter()
    const garment = makeGarment({ proxy3dPreview: PREVIEW })
    await adapter.saveGarments([garment])

    const unlinked = { ...garment, proxy3dPreview: undefined }
    await adapter.saveGarments([unlinked])
    const loaded = await adapter.loadGarments()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].proxy3dPreview).toBeUndefined()
  })

  it('a malformed preview is dropped while the garment is kept', () => {
    const corrupt = {
      ...makeGarment(),
      proxy3dPreview: { jobId: 42, mode: 'hologram' },
    }
    const parsed = parseGarments([corrupt])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].proxy3dPreview).toBeUndefined()
  })

  it('a corrupt-JSON store still yields a safe empty archive', async () => {
    localStorage.setItem(STORAGE_KEYS.garments, '{not json')
    const adapter = createLocalStorageAdapter()
    expect(await adapter.loadGarments()).toEqual([])
  })
})
