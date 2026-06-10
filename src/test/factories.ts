// Test data factories.
import type { GarmentItem } from '../domain/garmentTypes'

let counter = 0

/** Build a GarmentItem with sensible defaults; override any field. */
export function makeGarment(overrides: Partial<GarmentItem> = {}): GarmentItem {
  counter += 1
  const base: GarmentItem = {
    id: `grm-${counter}`,
    name: `Piece ${counter}`,
    category: 'top',
    color: 'Charcoal',
    colorHex: '#2b2b30',
    styleTags: ['minimal'],
    imageDataUrl: 'data:image/svg+xml,<svg/>',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  }
  return { ...base, ...overrides }
}
