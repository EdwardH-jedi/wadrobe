import { describe, expect, it } from 'vitest'
import { CATEGORY_ORDER } from './garmentTaxonomy'
import { getLayerPreset, getLayerZIndex, LAYER_PRESETS } from './garmentLayout'
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

describe('getLayerZIndex — cutout stacking (Phase 5)', () => {
  it('matches the preset order for every category when not a cutout', () => {
    for (const category of CATEGORY_ORDER) {
      expect(getLayerZIndex(category, false)).toBe(LAYER_PRESETS[category].zIndex)
    }
  })

  it('raises an outerwear CUTOUT above the top (natural drape) but below the accessory', () => {
    const outerwear = getLayerZIndex('outerwear', true)
    expect(outerwear).toBeGreaterThan(getLayerZIndex('top', false))
    expect(outerwear).toBeLessThan(LAYER_PRESETS.accessory.zIndex)
    // ...the opposite of the opaque-panel base order.
    expect(outerwear).toBeGreaterThan(LAYER_PRESETS.outerwear.zIndex)
  })

  it('leaves non-outerwear categories at their preset order even as cutouts', () => {
    for (const category of CATEGORY_ORDER) {
      if (category === 'outerwear') continue
      expect(getLayerZIndex(category, true)).toBe(LAYER_PRESETS[category].zIndex)
    }
  })
})
