// Market-value observation types for The Archive.
//
// `GarmentItem.price` is the PURCHASE price — what the user paid, once. These
// types record something different: a timestamped series of estimates of what a
// piece is worth *now*, so resale movement can be shown over time.
//
// Honesty: an observation is a recorded estimate, never a live quote. The
// `source` discriminant says where the numbers came from — `'manual'` is a
// figure the user typed; the `'ebay-*'` kinds are reserved for an explicitly
// operator-enabled lookup and are NOT wired up by this module. Nothing here
// fetches, and these types make no claim of accurate valuation or sizing.
//
// This module is pure types only — no logic, no I/O. Helpers live in
// `domain/priceHistory.ts`.

/**
 * One timestamped market-value reading for a garment.
 *
 * `low`/`median`/`high` describe the spread of the sample behind the reading;
 * `median` is the central estimate helpers compare against. `currency` is a
 * plain string paired with those numbers (e.g. "USD"), mirroring the existing
 * `price`/`currency` convention — values in different currencies are NOT
 * converted anywhere. `sampleSize` is how many data points backed the reading
 * (1 for a manual estimate).
 *
 * `source` says where the numbers came from: `'manual'` is a user-entered
 * estimate; `'ebay-browse'` (active listings) and `'ebay-sold'` (completed
 * sales) name an external lookup that this module does not perform.
 */
export interface PriceObservation {
  /** Epoch milliseconds (consistent with `createdAt`/`updatedAt`). */
  observedAt: number
  low: number
  median: number
  high: number
  currency: string
  sampleSize: number
  source: 'ebay-browse' | 'ebay-sold' | 'manual'
}

/**
 * A garment's full observation series.
 *
 * `observations` is sorted ascending by `observedAt` — the helpers in
 * `domain/priceHistory.ts` preserve that invariant and the storage parser
 * restores it, so readers may rely on it.
 */
export interface GarmentPriceHistory {
  garmentId: string
  /** Sorted ascending by `observedAt`. */
  observations: PriceObservation[]
}
