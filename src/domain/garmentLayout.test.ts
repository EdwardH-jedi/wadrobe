import { describe, expect, it } from 'vitest'
import { CATEGORY_ORDER } from './garmentTaxonomy'
import { getLayerPreset, LAYER_PRESETS } from './garmentLayout'
import type { LayerAnchor } from './garmentLayout'
import type { ClothingCategory } from './garmentTypes'

describe('garment layer presets', () => {
  const expectedAnchor: Record<ClothingCategory, LayerAnchor> = {
    outerwear: 'torso',
    top: 'torso',
    pants: 'legs',
    shoes: 'feet',
    accessory: 'upper-side',
  }

  for (const category of CATEGORY_ORDER) {
    it(`anchors ${category} to ${expectedAnchor[category]}`, () => {
      expect(getLayerPreset(category).anchor).toBe(expectedAnchor[category])
    })
  }

  it('covers every clothing category', () => {
    for (const category of CATEGORY_ORDER) {
      expect(LAYER_PRESETS[category]).toBeDefined()
      expect(LAYER_PRESETS[category].category).toBe(category)
    }
  })

  it('uses contain for wide/odd pieces (shoes, accessory) and cover for body garments', () => {
    expect(getLayerPreset('shoes').fit).toBe('contain')
    expect(getLayerPreset('accessory').fit).toBe('contain')
    expect(getLayerPreset('top').fit).toBe('cover')
    expect(getLayerPreset('pants').fit).toBe('cover')
    expect(getLayerPreset('outerwear').fit).toBe('cover')
  })

  it('keeps the verified stacking order: outerwear behind the top (deferred outerwear-above-top)', () => {
    // Documents the deliberate decision — opaque panels + nested geometry mean a
    // top must stay in front of outerwear to remain visible.
    expect(getLayerPreset('outerwear').zIndex).toBeLessThan(
      getLayerPreset('top').zIndex,
    )
  })
})
