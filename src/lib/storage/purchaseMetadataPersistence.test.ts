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

  it('round-trips a valid market-value history through the adapter', async () => {
    const adapter = createLocalStorageAdapter()
    const history = [
      { id: 'mkt-1', at: 1_700_000_000_000, value: 120 },
      { id: 'mkt-2', at: 1_700_000_100_000, value: 140, currency: 'USD' },
    ]
    const garment = makeGarment({ price: 100, marketValueHistory: history })
    await adapter.saveGarments([garment])

    const [loaded] = await adapter.loadGarments()
    expect(loaded.marketValueHistory).toEqual(history)
  })

  it('drops a non-array market-value history but keeps the garment', () => {
    const corrupt = {
      ...makeGarment({ material: 'silk' }),
      marketValueHistory: 'nope', // wrong type → dropped
    }
    const [parsed] = parseGarments([corrupt])
    expect(parsed.material).toBe('silk')
    expect(parsed.marketValueHistory).toBeUndefined()
  })

  it('filters malformed market-value entries, keeping valid ones', () => {
    const garment = {
      ...makeGarment(),
      marketValueHistory: [
        { id: 'ok', at: 1_700_000_000_000, value: 120 },
        { id: 'bad-value', at: 1_700_000_000_001, value: 'lots' }, // dropped
        { at: 1_700_000_000_002, value: 130 }, // missing id → dropped
        { id: 'bad-at', at: Number.NaN, value: 130 }, // not finite → dropped
        { id: 'ok2', at: 1_700_000_000_003, value: 140, currency: 'EUR' },
      ],
    }
    const [parsed] = parseGarments([garment])
    expect(parsed.marketValueHistory).toEqual([
      { id: 'ok', at: 1_700_000_000_000, value: 120 },
      { id: 'ok2', at: 1_700_000_000_003, value: 140, currency: 'EUR' },
    ])
  })

  it('leaves a garment with a fully valid history un-cloned', () => {
    const clean = makeGarment({
      marketValueHistory: [{ id: 'mkt-1', at: 1_700_000_000_000, value: 99 }],
    })
    const [parsed] = parseGarments([clean])
    expect(parsed).toBe(clean)
  })
})
