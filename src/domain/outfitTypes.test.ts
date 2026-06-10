import { describe, expect, it } from 'vitest'
import { CATEGORY_ORDER } from './garmentTaxonomy'
import {
  OUTFIT_SLOT_ORDER,
  countFilledSlots,
  createEmptyOutfit,
  isOutfitEmpty,
  silhouetteHint,
} from './outfitTypes'

// These tests pin the load-bearing structural invariant behind the whole
// data flow: an outfit has exactly one slot per clothing category. selectGarment
// routes by `garment.category` and sanitizeOutfit validates `category === slot`,
// so if a category ever lacked a matching slot, selection would silently break.
describe('outfit slot / category invariant', () => {
  it('createEmptyOutfit has one null slot per clothing category', () => {
    const empty = createEmptyOutfit()
    expect(Object.keys(empty).sort()).toEqual([...CATEGORY_ORDER].sort())
    expect(Object.values(empty).every((v) => v === null)).toBe(true)
  })

  it('OUTFIT_SLOT_ORDER mirrors CATEGORY_ORDER exactly', () => {
    expect(OUTFIT_SLOT_ORDER).toEqual(CATEGORY_ORDER)
    expect(OUTFIT_SLOT_ORDER).toHaveLength(5)
  })
})

describe('isOutfitEmpty / countFilledSlots', () => {
  it('treats a fresh outfit as empty', () => {
    expect(isOutfitEmpty(createEmptyOutfit())).toBe(true)
    expect(countFilledSlots(createEmptyOutfit())).toBe(0)
  })

  it('detects partially filled outfits', () => {
    const one = { ...createEmptyOutfit(), top: 'x' }
    expect(isOutfitEmpty(one)).toBe(false)
    expect(countFilledSlots(one)).toBe(1)

    const two = { ...createEmptyOutfit(), top: 'x', shoes: 'y' }
    expect(countFilledSlots(two)).toBe(2)
  })

  it('counts a fully filled outfit', () => {
    const full = {
      outerwear: 'a',
      top: 'b',
      pants: 'c',
      shoes: 'd',
      accessory: 'e',
    }
    expect(isOutfitEmpty(full)).toBe(false)
    expect(countFilledSlots(full)).toBe(5)
  })
})

describe('silhouetteHint', () => {
  const withSlots = (...slots: string[]) => {
    const sel = createEmptyOutfit()
    for (const slot of slots) sel[slot as keyof typeof sel] = 'x'
    return sel
  }

  it('returns null for an empty selection (caller owns the empty CTA)', () => {
    expect(silhouetteHint(createEmptyOutfit())).toBeNull()
  })

  it('prompts the torso layer first when no top/outerwear is styled', () => {
    expect(silhouetteHint(withSlots('pants'))).toMatch(/torso/i)
  })

  it('prompts pants, then shoes, then accessory as layers fill in', () => {
    expect(silhouetteHint(withSlots('top'))).toMatch(/legs|pants/i)
    expect(silhouetteHint(withSlots('top', 'pants'))).toMatch(/shoes/i)
    expect(silhouetteHint(withSlots('top', 'pants', 'shoes'))).toMatch(
      /accessory/i,
    )
  })

  it('reports a complete silhouette when every layer is styled', () => {
    expect(
      silhouetteHint(withSlots('outerwear', 'top', 'pants', 'shoes', 'accessory')),
    ).toMatch(/full silhouette/i)
  })
})
