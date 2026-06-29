import { describe, expect, it } from 'vitest'
import {
  formatMarketValue,
  latestMarketValue,
  marketValueDelta,
  sortedMarketValues,
} from './marketValue'
import type { MarketValueEntry } from './garmentTypes'
import { makeGarment } from '../test/factories'

function entry(at: number, value: number, currency?: string): MarketValueEntry {
  return { id: `mkt-${at}`, at, value, currency }
}

describe('sortedMarketValues', () => {
  it('returns [] for missing or empty history', () => {
    expect(sortedMarketValues(makeGarment())).toEqual([])
    expect(sortedMarketValues(makeGarment({ marketValueHistory: [] }))).toEqual(
      [],
    )
  })

  it('sorts oldest → newest by timestamp', () => {
    const garment = makeGarment({
      marketValueHistory: [entry(300, 30), entry(100, 10), entry(200, 20)],
    })
    expect(sortedMarketValues(garment).map((e) => e.value)).toEqual([10, 20, 30])
  })

  it('drops entries with non-finite value or timestamp', () => {
    const garment = makeGarment({
      marketValueHistory: [
        entry(100, 10),
        { id: 'bad-v', at: 150, value: Number.NaN },
        { id: 'bad-at', at: Number.POSITIVE_INFINITY, value: 99 },
        entry(200, 20),
      ],
    })
    expect(sortedMarketValues(garment).map((e) => e.value)).toEqual([10, 20])
  })
})

describe('latestMarketValue', () => {
  it('returns null when there is no history', () => {
    expect(latestMarketValue(makeGarment())).toBeNull()
  })

  it('returns the entry with the newest timestamp regardless of order', () => {
    const garment = makeGarment({
      marketValueHistory: [entry(300, 33), entry(100, 11), entry(200, 22)],
    })
    expect(latestMarketValue(garment)?.value).toBe(33)
  })
})

describe('marketValueDelta', () => {
  it('returns null with no history', () => {
    expect(marketValueDelta(makeGarment({ price: 100 }))).toBeNull()
  })

  it('computes absolute + percent + direction vs purchase price (up)', () => {
    const garment = makeGarment({
      price: 100,
      marketValueHistory: [entry(100, 100), entry(200, 150)],
    })
    const delta = marketValueDelta(garment)
    expect(delta).toEqual({
      latest: 150,
      base: 100,
      absolute: 50,
      percent: 50,
      direction: 'up',
    })
  })

  it('reports a drop as direction down with negative absolute/percent', () => {
    const garment = makeGarment({
      price: 200,
      marketValueHistory: [entry(100, 120)],
    })
    const delta = marketValueDelta(garment)
    expect(delta?.absolute).toBe(-80)
    expect(delta?.percent).toBe(-40)
    expect(delta?.direction).toBe('down')
  })

  it('reports flat when latest equals the purchase price', () => {
    const garment = makeGarment({
      price: 100,
      marketValueHistory: [entry(100, 100)],
    })
    const delta = marketValueDelta(garment)
    expect(delta?.absolute).toBe(0)
    expect(delta?.percent).toBe(0)
    expect(delta?.direction).toBe('flat')
  })

  // The no-price guard: percent is null and never NaN/Infinity.
  it('omits the percent and base when the garment has no price', () => {
    const garment = makeGarment({
      price: undefined,
      marketValueHistory: [entry(100, 75)],
    })
    const delta = marketValueDelta(garment)
    expect(delta).toEqual({
      latest: 75,
      base: null,
      absolute: null,
      percent: null,
      direction: 'flat',
    })
    expect(Number.isNaN(delta?.percent as number)).toBe(false)
  })

  it('omits the percent when price is 0 (no divide-by-zero)', () => {
    const garment = makeGarment({
      price: 0,
      marketValueHistory: [entry(100, 40)],
    })
    const delta = marketValueDelta(garment)
    // base is finite (0) so absolute is still computed, but percent stays null.
    expect(delta?.base).toBe(0)
    expect(delta?.absolute).toBe(40)
    expect(delta?.percent).toBeNull()
    expect(delta?.direction).toBe('up')
  })

  it('omits the percent when price is negative (guarded > 0)', () => {
    const garment = makeGarment({
      price: -10,
      marketValueHistory: [entry(100, 40)],
    })
    const delta = marketValueDelta(garment)
    expect(delta?.percent).toBeNull()
    expect(Number.isFinite(delta?.percent as number)).toBe(false)
  })
})

describe('formatMarketValue', () => {
  it('appends the currency when present', () => {
    expect(formatMarketValue(129, 'USD')).toBe('129 USD')
  })

  it('returns the bare number without a currency', () => {
    expect(formatMarketValue(129)).toBe('129')
  })

  it('returns empty string for a non-finite value', () => {
    expect(formatMarketValue(Number.NaN)).toBe('')
  })
})
