import { describe, expect, it } from 'vitest'
import {
  appendObservation,
  createPriceHistory,
  latestObservation,
  priceChangeOverWindow,
  priceChangeSincePurchase,
  sortedObservations,
} from './priceHistory'
import type { GarmentPriceHistory, PriceObservation } from './priceTypes'
import { makeGarment } from '../test/factories'

const DAY = 86_400_000

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
    sampleSize: 5,
    source: 'ebay-sold',
    ...overrides,
  }
}

function history(...observations: PriceObservation[]): GarmentPriceHistory {
  return { garmentId: 'grm-1', observations }
}

describe('createPriceHistory', () => {
  it('builds an empty series for the given garment', () => {
    expect(createPriceHistory('grm-9')).toEqual({
      garmentId: 'grm-9',
      observations: [],
    })
  })
})

describe('sortedObservations', () => {
  it('returns [] for an undefined or empty history', () => {
    expect(sortedObservations(undefined)).toEqual([])
    expect(sortedObservations(history())).toEqual([])
  })

  it('sorts oldest → newest by observedAt', () => {
    const sorted = sortedObservations(
      history(obs(300, 30), obs(100, 10), obs(200, 20)),
    )
    expect(sorted.map((o) => o.median)).toEqual([10, 20, 30])
  })

  it('drops observations with non-finite numbers', () => {
    const sorted = sortedObservations(
      history(
        obs(100, 10),
        obs(150, Number.NaN),
        obs(Number.POSITIVE_INFINITY, 99),
        obs(175, 50, { low: Number.NaN }),
        obs(200, 20),
      ),
    )
    expect(sorted.map((o) => o.median)).toEqual([10, 20])
  })

  it('never mutates the input array', () => {
    const source = history(obs(300, 30), obs(100, 10))
    const before = [...source.observations]
    sortedObservations(source)
    expect(source.observations).toEqual(before)
  })
})

describe('latestObservation', () => {
  it('returns null when there is nothing usable', () => {
    expect(latestObservation(undefined)).toBeNull()
    expect(latestObservation(history())).toBeNull()
  })

  it('returns the newest observation regardless of stored order', () => {
    expect(
      latestObservation(history(obs(300, 33), obs(100, 11), obs(200, 22)))
        ?.median,
    ).toBe(33)
  })
})

describe('appendObservation', () => {
  it('appends a newer observation to the end', () => {
    const next = appendObservation(history(obs(100, 10)), obs(200, 20))
    expect(next.observations.map((o) => o.observedAt)).toEqual([100, 200])
  })

  it('keeps ascending order when the observation arrives late', () => {
    const next = appendObservation(
      history(obs(100, 10), obs(300, 30)),
      obs(200, 20),
    )
    expect(next.observations.map((o) => o.observedAt)).toEqual([100, 200, 300])
  })

  it('places a tied timestamp after the existing entry (recording order)', () => {
    const next = appendObservation(
      history(obs(100, 10), obs(200, 20)),
      obs(100, 99),
    )
    expect(next.observations.map((o) => o.median)).toEqual([10, 99, 20])
  })

  it('appends into an empty series', () => {
    const next = appendObservation(createPriceHistory('grm-1'), obs(100, 10))
    expect(next.observations).toHaveLength(1)
  })

  it('preserves garmentId', () => {
    const next = appendObservation(
      { garmentId: 'grm-42', observations: [] },
      obs(100, 10),
    )
    expect(next.garmentId).toBe('grm-42')
  })

  it('is pure — the input history and array are untouched', () => {
    const original = history(obs(100, 10))
    const originalObservations = original.observations
    const next = appendObservation(original, obs(200, 20))

    expect(original.observations).toHaveLength(1)
    expect(original.observations).toBe(originalObservations)
    expect(next).not.toBe(original)
    expect(next.observations).not.toBe(originalObservations)
  })
})

describe('priceChangeOverWindow', () => {
  const now = 100 * DAY

  it('returns null without a history', () => {
    expect(priceChangeOverWindow(undefined, 30 * DAY, now)).toBeNull()
  })

  it('returns null when only one observation falls in the window', () => {
    // The older reading sits outside the window, so there is no movement the
    // archive has actually observed inside it.
    const series = history(obs(now - 90 * DAY, 100), obs(now - DAY, 200))
    expect(priceChangeOverWindow(series, 30 * DAY, now)).toBeNull()
  })

  it('compares the oldest and newest observation inside the window', () => {
    const series = history(
      obs(now - 90 * DAY, 500), // outside → ignored
      obs(now - 20 * DAY, 100),
      obs(now - 10 * DAY, 150),
      obs(now - DAY, 120),
    )
    const change = priceChangeOverWindow(series, 30 * DAY, now)
    expect(change?.from.median).toBe(100)
    expect(change?.to.median).toBe(120)
    expect(change?.absolute).toBe(20)
    expect(change?.percent).toBe(20)
    expect(change?.direction).toBe('up')
    expect(change?.sampleCount).toBe(3)
    expect(change?.currencyMismatch).toBe(false)
  })

  it('reports a decline as direction down', () => {
    const series = history(obs(now - 5 * DAY, 200), obs(now - DAY, 150))
    const change = priceChangeOverWindow(series, 30 * DAY, now)
    expect(change?.absolute).toBe(-50)
    expect(change?.percent).toBe(-25)
    expect(change?.direction).toBe('down')
  })

  it('reports flat when the value did not move', () => {
    const series = history(obs(now - 5 * DAY, 200), obs(now - DAY, 200))
    const change = priceChangeOverWindow(series, 30 * DAY, now)
    expect(change?.absolute).toBe(0)
    expect(change?.percent).toBe(0)
    expect(change?.direction).toBe('flat')
  })

  it('ignores observations dated after now', () => {
    const series = history(
      obs(now - 5 * DAY, 100),
      obs(now - DAY, 110),
      obs(now + DAY, 999), // future → ignored
    )
    const change = priceChangeOverWindow(series, 30 * DAY, now)
    expect(change?.to.median).toBe(110)
    expect(change?.sampleCount).toBe(2)
  })

  it('includes an observation exactly on the window boundary', () => {
    const series = history(obs(now - 30 * DAY, 100), obs(now, 130))
    const change = priceChangeOverWindow(series, 30 * DAY, now)
    expect(change?.sampleCount).toBe(2)
    expect(change?.absolute).toBe(30)
  })

  it('omits the percent when the baseline median is 0 (no divide-by-zero)', () => {
    const series = history(obs(now - 5 * DAY, 0), obs(now - DAY, 40))
    const change = priceChangeOverWindow(series, 30 * DAY, now)
    expect(change?.absolute).toBe(40)
    expect(change?.percent).toBeNull()
    expect(change?.direction).toBe('up')
  })

  it('flags a currency mismatch instead of pretending to convert', () => {
    const series = history(
      obs(now - 5 * DAY, 100, { currency: 'USD' }),
      obs(now - DAY, 120, { currency: 'EUR' }),
    )
    expect(priceChangeOverWindow(series, 30 * DAY, now)?.currencyMismatch).toBe(
      true,
    )
  })

  it('returns null for a non-positive or non-finite window', () => {
    const series = history(obs(now - 5 * DAY, 100), obs(now - DAY, 120))
    expect(priceChangeOverWindow(series, 0, now)).toBeNull()
    expect(priceChangeOverWindow(series, -DAY, now)).toBeNull()
    expect(priceChangeOverWindow(series, Number.NaN, now)).toBeNull()
    expect(priceChangeOverWindow(series, 30 * DAY, Number.NaN)).toBeNull()
  })
})

describe('priceChangeSincePurchase', () => {
  it('returns null when the garment has no observations', () => {
    expect(priceChangeSincePurchase(makeGarment({ price: 100 }))).toBeNull()
  })

  it('returns null when the garment has no purchase price', () => {
    const garment = makeGarment({ priceHistory: history(obs(100, 150)) })
    expect(priceChangeSincePurchase(garment)).toBeNull()
  })

  it('compares the newest observation against the purchase price', () => {
    const garment = makeGarment({
      price: 100,
      currency: 'USD',
      priceHistory: history(obs(100, 120), obs(200, 150)),
    })
    const change = priceChangeSincePurchase(garment)
    expect(change?.latest.median).toBe(150)
    expect(change?.base).toBe(100)
    expect(change?.absolute).toBe(50)
    expect(change?.percent).toBe(50)
    expect(change?.direction).toBe('up')
    expect(change?.currencyMismatch).toBe(false)
  })

  it('reports a loss of value as direction down', () => {
    const garment = makeGarment({
      price: 200,
      priceHistory: history(obs(100, 120)),
    })
    const change = priceChangeSincePurchase(garment)
    expect(change?.absolute).toBe(-80)
    expect(change?.percent).toBe(-40)
    expect(change?.direction).toBe('down')
  })

  it('reports flat when the latest median equals the purchase price', () => {
    const garment = makeGarment({
      price: 100,
      priceHistory: history(obs(100, 100)),
    })
    const change = priceChangeSincePurchase(garment)
    expect(change?.absolute).toBe(0)
    expect(change?.direction).toBe('flat')
  })

  it('omits the percent when the purchase price is 0', () => {
    const garment = makeGarment({
      price: 0,
      priceHistory: history(obs(100, 40)),
    })
    const change = priceChangeSincePurchase(garment)
    expect(change?.base).toBe(0)
    expect(change?.absolute).toBe(40)
    expect(change?.percent).toBeNull()
    expect(Number.isNaN(change?.percent as number)).toBe(false)
  })

  it('omits the percent when the purchase price is negative', () => {
    const garment = makeGarment({
      price: -10,
      priceHistory: history(obs(100, 40)),
    })
    expect(priceChangeSincePurchase(garment)?.percent).toBeNull()
  })

  it('flags a currency mismatch against the garment currency', () => {
    const garment = makeGarment({
      price: 100,
      currency: 'GBP',
      priceHistory: history(obs(100, 150, { currency: 'USD' })),
    })
    expect(priceChangeSincePurchase(garment)?.currencyMismatch).toBe(true)
  })

  it('does not flag a mismatch when the garment records no currency', () => {
    const garment = makeGarment({
      price: 100,
      priceHistory: history(obs(100, 150, { currency: 'USD' })),
    })
    expect(priceChangeSincePurchase(garment)?.currencyMismatch).toBe(false)
  })

  it('ignores unusable observations when picking the latest', () => {
    const garment = makeGarment({
      price: 100,
      priceHistory: history(obs(100, 120), obs(200, Number.NaN)),
    })
    expect(priceChangeSincePurchase(garment)?.latest.median).toBe(120)
  })
})
