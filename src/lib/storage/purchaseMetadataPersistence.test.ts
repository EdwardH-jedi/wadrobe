// Phase 1: persistence round-trip + parser tolerance for the new optional
// purchase metadata + analysis-provenance fields on a garment.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GarmentItem } from '../../domain/garmentTypes'
import { makeGarment } from '../../test/factories'
import { createLocalStorageAdapter } from './localStorageFallback'
import { parseGarments } from './storageTypes'

const RICH: Partial<GarmentItem> = {
  material: '100% wool',
  size: 'M',
  price: 129.99,
  currency: 'USD',
  subtype: 'overcoat',
  purchasedAt: 1_700_000_000_000,
  retailer: 'Maison Grey',
  analysisConfidence: 0.82,
  analysisSource: 'mock',
  userEdited: true,
}

describe('purchase metadata persistence (Phase 1)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('legacy records without the new fields parse cleanly', () => {
    const legacy = makeGarment()
    const parsed = parseGarments([legacy])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].material).toBeUndefined()
    expect(parsed[0].price).toBeUndefined()
    expect(parsed[0].analysisSource).toBeUndefined()
  })

  it('the full field set round-trips through the storage adapter', async () => {
    const adapter = createLocalStorageAdapter()
    const garment = makeGarment(RICH)
    await adapter.saveGarments([garment])

    const loaded = await adapter.loadGarments()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject(RICH)
  })

  it('drops malformed values while keeping the garment (and its valid fields)', () => {
    const corrupt = {
      ...makeGarment({ material: 'silk', size: 'S' }),
      price: 'twelve', // wrong type → dropped
      purchasedAt: Number.NaN, // not finite → dropped
      analysisConfidence: 'high', // wrong type → dropped
      analysisSource: 'gpt', // not a known source → dropped
      userEdited: 'yes', // wrong type → dropped
    }
    const [parsed] = parseGarments([corrupt])
    expect(parsed).toBeDefined()
    // Valid fields survive…
    expect(parsed.material).toBe('silk')
    expect(parsed.size).toBe('S')
    // …malformed ones are stripped.
    expect(parsed.price).toBeUndefined()
    expect(parsed.purchasedAt).toBeUndefined()
    expect(parsed.analysisConfidence).toBeUndefined()
    expect(parsed.analysisSource).toBeUndefined()
    expect(parsed.userEdited).toBeUndefined()
  })

  it('leaves a clean garment object un-cloned (no needless allocation)', () => {
    const clean = makeGarment({ material: 'denim' })
    const [parsed] = parseGarments([clean])
    expect(parsed).toBe(clean)
  })
})
