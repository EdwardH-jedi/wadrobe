// Pure value-math over a garment's `PriceObservation` series. Given the
// timestamped market-value readings in `GarmentItem.priceHistory` and the
// garment's original purchase `price`, these helpers derive how the estimated
// worth has moved.
//
// Every function here is pure and side-effect free: no `Date.now`, no `crypto`,
// no mutation of the inputs. Callers pass `now` explicitly so results stay
// deterministic and unit-testable (the provider owns real clock reads).
//
// Honesty: these helpers compute arithmetic over recorded estimates. Nothing is
// fetched, and a computed change is not a valuation or an appraisal.
import type { GarmentItem } from './garmentTypes'
import type { GarmentPriceHistory, PriceObservation } from './priceTypes'

/** Direction of a change. `'flat'` means no movement (or nothing to compare). */
export type PriceDirection = 'up' | 'down' | 'flat'

/** A movement between two observations in the series. */
export interface PriceChange {
  /** The older observation, used as the baseline. */
  from: PriceObservation
  /** The newer observation, compared against the baseline. */
  to: PriceObservation
  /** `to.median - from.median`. */
  absolute: number
  /** Percent change vs `from.median`; null unless `from.median > 0`, so a
   *  caller never receives NaN/Infinity. */
  percent: number | null
  direction: PriceDirection
  /** How many observations fell inside the window (always >= 2 here). */
  sampleCount: number
  /** True when `from` and `to` are quoted in different currencies — the
   *  arithmetic is then meaningless and callers should not present it as a
   *  real change. Nothing here converts between currencies. */
  currencyMismatch: boolean
}

/** The latest observation measured against what the user actually paid. */
export interface PriceChangeSincePurchase {
  /** The most recent observation in the series. */
  latest: PriceObservation
  /** The purchase-price baseline (`garment.price`). */
  base: number
  /** `latest.median - base`. */
  absolute: number
  /** Percent change vs `base`; null unless `base > 0`. */
  percent: number | null
  direction: PriceDirection
  /** True when the garment records a `currency` that differs from the
   *  observation's. As above, no conversion is performed. */
  currencyMismatch: boolean
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isUsableObservation(value: PriceObservation): boolean {
  return (
    isFiniteNumber(value.observedAt) &&
    isFiniteNumber(value.median) &&
    isFiniteNumber(value.low) &&
    isFiniteNumber(value.high)
  )
}

function directionOf(absolute: number): PriceDirection {
  if (absolute > 0) return 'up'
  if (absolute < 0) return 'down'
  return 'flat'
}

/** Percent change of `absolute` against `base`, or null when `base` is not a
 *  positive finite number (keeps NaN/Infinity out of every result). */
function percentOf(absolute: number, base: number): number | null {
  return base > 0 ? (absolute / base) * 100 : null
}

/** An empty history for a garment. Pure — the caller supplies the id. */
export function createPriceHistory(garmentId: string): GarmentPriceHistory {
  return { garmentId, observations: [] }
}

/**
 * Observations sorted oldest → newest, defensively dropping any whose numbers
 * are non-finite (the storage parser should have removed these already; this
 * keeps the helpers total). Stable for equal timestamps. Never mutates the
 * input — always returns a fresh array.
 */
export function sortedObservations(
  history: GarmentPriceHistory | undefined,
): PriceObservation[] {
  const observations = history?.observations
  if (!Array.isArray(observations) || observations.length === 0) return []
  return observations
    .filter(isUsableObservation)
    .sort((a, b) => a.observedAt - b.observedAt)
}

/** The most recent usable observation, or null when there is none. */
export function latestObservation(
  history: GarmentPriceHistory | undefined,
): PriceObservation | null {
  const sorted = sortedObservations(history)
  return sorted.length > 0 ? sorted[sorted.length - 1] : null
}

/**
 * Append an observation, preserving the ascending-`observedAt` invariant.
 *
 * Returns a NEW history object with a NEW observations array — the input is
 * never mutated, so this is safe to call from a reducer. An out-of-order
 * observation (one older than the tail) is inserted at its correct position
 * rather than rejected; an observation with the same timestamp as an existing
 * one lands after it, so recording order is preserved for ties.
 */
export function appendObservation(
  history: GarmentPriceHistory,
  observation: PriceObservation,
): GarmentPriceHistory {
  const existing = Array.isArray(history.observations)
    ? history.observations
    : []
  // Fast path: the common case is a new reading that is already the newest.
  const tail = existing[existing.length - 1]
  if (!tail || tail.observedAt <= observation.observedAt) {
    return { ...history, observations: [...existing, observation] }
  }

  // Late arrival: splice it in ahead of the first strictly-newer entry.
  const index = existing.findIndex((e) => e.observedAt > observation.observedAt)
  const at = index === -1 ? existing.length : index
  return {
    ...history,
    observations: [
      ...existing.slice(0, at),
      observation,
      ...existing.slice(at),
    ],
  }
}

/**
 * How the estimated value moved across the window ending at `now`.
 *
 * Only observations inside `[now - windowMs, now]` are considered, and the
 * oldest and newest of those are compared. Returns null when fewer than two
 * observations fall in the window — that is deliberate: with one data point
 * there is no movement to report, and reporting "0%" would imply a stability
 * the archive has not observed. Callers should treat null as "not enough data".
 *
 * `windowMs` must be a positive finite number; anything else yields null.
 */
export function priceChangeOverWindow(
  history: GarmentPriceHistory | undefined,
  windowMs: number,
  now: number,
): PriceChange | null {
  if (!isFiniteNumber(windowMs) || windowMs <= 0) return null
  if (!isFiniteNumber(now)) return null

  const start = now - windowMs
  const inWindow = sortedObservations(history).filter(
    (o) => o.observedAt >= start && o.observedAt <= now,
  )
  if (inWindow.length < 2) return null

  const from = inWindow[0]
  const to = inWindow[inWindow.length - 1]
  const absolute = to.median - from.median

  return {
    from,
    to,
    absolute,
    percent: percentOf(absolute, from.median),
    direction: directionOf(absolute),
    sampleCount: inWindow.length,
    currencyMismatch: from.currency !== to.currency,
  }
}

/**
 * The latest observation measured against the garment's purchase price.
 *
 * Returns null when there is no usable observation or the garment has no finite
 * `price` — there is then no baseline, and inventing one would be dishonest.
 * A price of 0 (or negative) still yields a result, but `percent` stays null so
 * callers never see a divide-by-zero artefact.
 */
export function priceChangeSincePurchase(
  garment: GarmentItem,
): PriceChangeSincePurchase | null {
  const latest = latestObservation(garment.priceHistory)
  if (!latest) return null
  if (!isFiniteNumber(garment.price)) return null

  const base = garment.price
  const absolute = latest.median - base

  return {
    latest,
    base,
    absolute,
    percent: percentOf(absolute, base),
    direction: directionOf(absolute),
    currencyMismatch:
      typeof garment.currency === 'string' &&
      garment.currency !== latest.currency,
  }
}
