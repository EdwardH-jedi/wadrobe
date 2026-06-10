// Outfit domain types and small pure helpers.
import type { ClothingCategory } from './garmentTypes'
import { CATEGORY_ORDER } from './garmentTaxonomy'

/** An outfit slot maps 1:1 to a clothing category. */
export type OutfitSlot = ClothingCategory

/** The current outfit: each slot holds a garment id or null (empty). */
export type OutfitSelection = Record<OutfitSlot, string | null>

/** A persisted look: a named snapshot of an outfit selection. */
export interface SavedOutfit {
  id: string
  name: string
  selection: OutfitSelection
  createdAt: number
  /** Cached cover hue for the editorial look card (derived at save time). */
  coverHex: string
}

/** Canonical slot order — mirrors the category order. */
export const OUTFIT_SLOT_ORDER: OutfitSlot[] = CATEGORY_ORDER

/** A fresh, fully-empty outfit selection. */
export function createEmptyOutfit(): OutfitSelection {
  return {
    outerwear: null,
    top: null,
    pants: null,
    shoes: null,
    accessory: null,
  }
}

/** True when no slot holds a garment. */
export function isOutfitEmpty(selection: OutfitSelection): boolean {
  return OUTFIT_SLOT_ORDER.every((slot) => selection[slot] === null)
}

/** Number of filled slots in a selection. */
export function countFilledSlots(selection: OutfitSelection): number {
  return OUTFIT_SLOT_ORDER.reduce(
    (n, slot) => (selection[slot] ? n + 1 : n),
    0,
  )
}

/**
 * A single, composition-framed line for the Mirror caption describing the
 * silhouette's next layer (or that it is complete). Deliberately framed around
 * "layers / silhouette" so it reads distinctly from the inspector's FitCheck
 * notes that sit beside it. Returns `null` for an empty selection — the caller
 * shows its own "select pieces" call-to-action there.
 */
export function silhouetteHint(selection: OutfitSelection): string | null {
  if (isOutfitEmpty(selection)) return null
  const has = (slot: OutfitSlot) => selection[slot] !== null
  if (!has('top') && !has('outerwear')) {
    return 'Torso layer open — style a top or outerwear.'
  }
  if (!has('pants')) return 'Legs layer open — style a pair of pants.'
  if (!has('shoes')) return 'Complete the silhouette with shoes.'
  if (!has('accessory')) return 'Core silhouette set — finish with an accessory.'
  return 'Full silhouette — every layer styled.'
}
