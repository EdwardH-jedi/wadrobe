// Pure value-math for the manual market-value tracker. Given a garment's
// `marketValueHistory` (estimates the user typed) and its original `price`,
// these helpers derive the latest value and the trend versus purchase. No
// `Date.now`/`crypto` here — the provider injects ids/timestamps when recording.
//
// Honesty: every value is a MANUAL estimate the user entered, never live or
// fetched market data. These helpers compute arithmetic only.
import type { GarmentItem, MarketValueEntry } from './garmentTypes'

/** Direction of the latest value versus the purchase price. `'flat'` is also
 *  used when there is no comparable base (no finite purchase price). */
export type MarketValueDirection = 'up' | 'down' | 'flat'

export interface MarketValueDelta {
  /** The most recently recorded value. */
  latest: number
  /** Purchase-price baseline, or null when the garment has no finite price. */
  base: number | null
  /** `latest - base`, or null when there is no base to compare against. */
  absolute: number | null
  /** Percent change vs base, or null unless `base > 0` (never NaN/Infinity). */
  percent: number | null
  direction: MarketValueDirection
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * History sorted oldest → newest by `at`, defensively dropping entries with a
 * non-finite `value` or `at` (the persisted sanitizer should have removed these
 * already; this keeps the helpers total). Stable for equal timestamps.
 */
export function sortedMarketValues(garment: GarmentItem): MarketValueEntry[] {
  const history = garment.marketValueHistory
  if (!Array.isArray(history) || history.length === 0) return []
  return history
    .filter((e) => isFiniteNumber(e.value) && isFiniteNumber(e.at))
    .sort((a, b) => a.at - b.at)
}

/** The most recent manual estimate, or null when there is none. */
export function latestMarketValue(garment: GarmentItem): MarketValueEntry | null {
  const sorted = sortedMarketValues(garment)
  return sorted.length > 0 ? sorted[sorted.length - 1] : null
}

/**
 * The latest value and its movement versus the purchase price. Returns null
 * when there is no usable history. The percent is computed ONLY when the
 * purchase price is finite and > 0, so callers never receive NaN/Infinity.
 */
export function marketValueDelta(garment: GarmentItem): MarketValueDelta | null {
  const latestEntry = latestMarketValue(garment)
  if (!latestEntry) return null

  const latest = latestEntry.value
  const base = isFiniteNumber(garment.price) ? garment.price : null
  const absolute = base !== null ? latest - base : null
  const percent =
    base !== null && base > 0 && absolute !== null
      ? (absolute / base) * 100
      : null

  let direction: MarketValueDirection = 'flat'
  if (absolute !== null) {
    if (absolute > 0) direction = 'up'
    else if (absolute < 0) direction = 'down'
  }

  return { latest, base, absolute, percent, direction }
}

/** Compact value label, e.g. "129 USD" or "129" — reused by card + panel. */
export function formatMarketValue(value: number, currency?: string): string {
  if (!isFiniteNumber(value)) return ''
  return currency ? `${value} ${currency}` : String(value)
}
