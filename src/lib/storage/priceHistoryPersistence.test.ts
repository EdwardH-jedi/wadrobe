// Persistence round-trip + parser tolerance for the optional `priceHistory`
// field (timestamped market-value observations) on a garment.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PriceObservation } from '../../domain/priceTypes'
import { makeGarment } from '../../test/factories'
import { createLocalStorageAdapter } from './localStorageFallback'
import { parseGarments } from './storageTypes'

function obs(
  observedAt: number,
  median: number,
  overrides: Partial<PriceObservation> = {},
): PriceObservation {
  return {
    observedAt,
    low: median - 10,
    median,
    high: median + 10,
    currency: 'USD',
    sampleSize: 4,
    source: 'ebay-sold',
    ...overrides,
  }
}

describe('price history persistence', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('legacy records without a price history parse cleanly', () => {
    const [parsed] = parseGarments([makeGarment()])
    expect(parsed).toBeDefined()
    expect(parsed.priceHistory).toBeUndefined()
  })

  it('round-trips a valid history through the storage adapter', async () => {
    const adapter = createLocalStorageAdapter()
    const priceHistory = {
      garmentId: 'grm-round-trip',
      observations: [
        obs(1_700_000_000_000, 120),
        obs(1_700_000_100_000, 140, { source: 'manual' as const }),
        obs(1_700_000_200_000, 155, { source: 'ebay-browse' as const }),
      ],
    }
    await adapter.saveGarments([makeGarment({ price: 100, priceHistory })])

    const [loaded] = await adapter.loadGarments()
    expect(loaded.priceHistory).toEqual(priceHistory)
  })

  it('leaves a garment with a fully valid history un-cloned', () => {
    const clean = makeGarment({
      priceHistory: {
        garmentId: 'grm-clean',
        observations: [obs(1_700_000_000_000, 99)],
      },
    })
    const [parsed] = parseGarments([clean])
    expect(parsed).toBe(clean)
  })

  it('keeps an empty observations array as-is', () => {
    const garment = makeGarment({
      priceHistory: { garmentId: 'grm-empty', observations: [] },
    })
    const [parsed] = parseGarments([garment])
    expect(parsed.priceHistory).toEqual({
      garmentId: 'grm-empty',
      observations: [],
    })
  })

  it('drops a non-object price history but keeps the garment', () => {
    const corrupt = {
      ...makeGarment({ material: 'silk' }),
      priceHistory: 'nope',
    }
    const [parsed] = parseGarments([corrupt])
    expect(parsed.material).toBe('silk')
    expect(parsed.priceHistory).toBeUndefined()
  })

  it('drops a history whose garmentId is missing or empty', () => {
    const missing = {
      ...makeGarment(),
      priceHistory: { observations: [obs(1_700_000_000_000, 100)] },
    }
    const empty = {
      ...makeGarment(),
      priceHistory: {
        garmentId: '',
        observations: [obs(1_700_000_000_000, 100)],
      },
    }
    expect(parseGarments([missing])[0].priceHistory).toBeUndefined()
    expect(parseGarments([empty])[0].priceHistory).toBeUndefined()
  })

  it('drops a history whose observations are not an array', () => {
    const corrupt = {
      ...makeGarment(),
      priceHistory: { garmentId: 'grm-1', observations: { median: 100 } },
    }
    expect(parseGarments([corrupt])[0].priceHistory).toBeUndefined()
  })

  it('filters malformed observations, keeping the valid ones', () => {
    const good = obs(1_700_000_000_000, 100)
    const alsoGood = obs(1_700_000_400_000, 140)
    const garment = {
      ...makeGarment(),
      priceHistory: {
        garmentId: 'grm-1',
        observations: [
          good,
          { ...obs(1_700_000_000_001, 110), median: 'lots' }, // wrong type
          { ...obs(1_700_000_000_002, 110), observedAt: Number.NaN }, // not finite
          { ...obs(1_700_000_000_003, 110), source: 'grailed' }, // unknown source
          { ...obs(1_700_000_000_004, 110), currency: 42 }, // wrong type
          { ...obs(1_700_000_000_005, 110), sampleSize: '4' }, // wrong type
          { ...obs(1_700_000_000_006, 110), high: Number.POSITIVE_INFINITY },
          alsoGood,
        ],
      },
    }
    const [parsed] = parseGarments([garment])
    expect(parsed.priceHistory?.observations).toEqual([good, alsoGood])
    // The garment itself and its other fields survive.
    expect(parsed.id).toBe(garment.id)
  })

  it('accepts every known observation source', () => {
    const observations = [
      obs(1_700_000_000_000, 100, { source: 'ebay-browse' as const }),
      obs(1_700_000_100_000, 110, { source: 'ebay-sold' as const }),
      obs(1_700_000_200_000, 120, { source: 'manual' as const }),
    ]
    const garment = makeGarment({
      priceHistory: { garmentId: 'grm-1', observations },
    })
    expect(parseGarments([garment])[0].priceHistory?.observations).toEqual(
      observations,
    )
  })

  it('restores ascending order when stored observations drifted', () => {
    const garment = {
      ...makeGarment(),
      priceHistory: {
        garmentId: 'grm-1',
        observations: [
          obs(1_700_000_200_000, 130),
          obs(1_700_000_000_000, 100),
          obs(1_700_000_100_000, 120),
        ],
      },
    }
    const [parsed] = parseGarments([garment])
    expect(
      parsed.priceHistory?.observations.map((o) => o.observedAt),
    ).toEqual([1_700_000_000_000, 1_700_000_100_000, 1_700_000_200_000])
  })

  it('does not disturb the garment when only the history needed repair', () => {
    const garment = makeGarment({
      material: 'wool',
      price: 200,
      priceHistory: {
        garmentId: 'grm-1',
        observations: [obs(1_700_000_000_000, 100), { bogus: true }],
      } as never,
    })
    const [parsed] = parseGarments([garment])
    expect(parsed.material).toBe('wool')
    expect(parsed.price).toBe(200)
    expect(parsed.priceHistory?.observations).toHaveLength(1)
  })

  it('drops a malformed history alongside other malformed fields', () => {
    const corrupt = {
      ...makeGarment({ size: 'M' }),
      price: 'twelve',
      priceHistory: 12,
    }
    const [parsed] = parseGarments([corrupt])
    expect(parsed.size).toBe('M')
    expect(parsed.price).toBeUndefined()
    expect(parsed.priceHistory).toBeUndefined()
  })
})
