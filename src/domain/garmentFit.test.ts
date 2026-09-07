// The 2.5D fitting maths (revival Phase 2). Pure numbers, no DOM: what the
// mannequin renders is a direct consequence of these, so they are asserted here
// rather than through brittle style assertions on a component.
import { describe, expect, it } from 'vitest'
import type { NormalizedContentBounds } from './contentBounds'
import {
  LAYER_GEOMETRY,
  MANNEQUIN_ASPECT,
  ZONE_BOXES,
  fitCutoutLayer,
  getLayerGeometry,
  getLayerZIndex,
} from './garmentLayout'

/** Where the content actually ends up on the stage, in stage fractions. */
function placedContent(
  layer: { leftPct: number; topPct: number; widthPct: number },
  bounds: NormalizedContentBounds,
  stageAspect = MANNEQUIN_ASPECT,
) {
  const imageWidth = layer.widthPct / 100
  const imageHeight = (imageWidth / bounds.sourceAspect) * stageAspect
  const left = layer.leftPct / 100 + bounds.x * imageWidth
  const top = layer.topPct / 100 + bounds.y * imageHeight
  const width = bounds.width * imageWidth
  const height = bounds.height * imageHeight
  return {
    left,
    top,
    width,
    height,
    centreX: left + width / 2,
    centreY: top + height / 2,
  }
}

const shoeBounds: NormalizedContentBounds = {
  // A wide shoe sitting in the middle of a square frame — the shape that made
  // the old panel approach look so obviously artificial.
  x: 0.1,
  y: 0.4,
  width: 0.8,
  height: 0.25,
  sourceAspect: 1,
}

describe('fitCutoutLayer — the content lands where it was aimed', () => {
  it('centres the content on its anchor, not the transparent canvas', () => {
    const geometry = getLayerGeometry('shoes')
    const layer = fitCutoutLayer(geometry, shoeBounds)!
    const placed = placedContent(layer, shoeBounds)

    expect(placed.centreX).toBeCloseTo(geometry.anchorX, 5)
    expect(placed.centreY).toBeCloseTo(geometry.anchorY, 5)
  })

  it('gives the content its target width', () => {
    const geometry = getLayerGeometry('shoes')
    const layer = fitCutoutLayer(geometry, shoeBounds)!

    expect(placedContent(layer, shoeBounds).width).toBeCloseTo(
      geometry.targetWidth,
      5,
    )
  })

  it('draws the image larger than the stage when the content is a small part of it', () => {
    // The whole point: a shoe filling 20% of its frame needs the frame drawn
    // five times its target width for the shoe itself to come out right.
    const sparse: NormalizedContentBounds = {
      x: 0.4,
      y: 0.45,
      width: 0.2,
      height: 0.1,
      sourceAspect: 1,
    }
    const layer = fitCutoutLayer(getLayerGeometry('shoes'), sparse)!

    expect(layer.widthPct).toBeGreaterThan(100)
    expect(placedContent(layer, sparse).width).toBeCloseTo(0.36, 5)
  })

  it('scales down rather than stretching when the content is too tall', () => {
    // A very tall coat photo. The height cap must win, and the garment must
    // keep its proportions: a squashed garment is worse than a small one.
    const tall: NormalizedContentBounds = {
      x: 0.25,
      y: 0.02,
      width: 0.5,
      height: 0.96,
      sourceAspect: 0.5,
    }
    const geometry = getLayerGeometry('outerwear')
    const layer = fitCutoutLayer(geometry, tall)!
    const placed = placedContent(layer, tall)

    expect(placed.height).toBeCloseTo(geometry.maxHeight, 5)
    expect(placed.width).toBeLessThan(geometry.targetWidth)
    // Still centred on the anchor after the scale-down.
    expect(placed.centreX).toBeCloseTo(geometry.anchorX, 5)
    expect(placed.centreY).toBeCloseTo(geometry.anchorY, 5)

    // Aspect preserved: the content's on-stage shape matches the source shape.
    const sourceContentAspect =
      (tall.width / tall.height) * tall.sourceAspect * (1 / MANNEQUIN_ASPECT)
    expect(placed.width / placed.height).toBeCloseTo(sourceContentAspect, 5)
  })

  it('never exceeds a category height cap', () => {
    for (const category of [
      'outerwear',
      'top',
      'pants',
      'shoes',
      'accessory',
    ] as const) {
      const geometry = getLayerGeometry(category)
      for (const sourceAspect of [0.4, 1, 2.5]) {
        for (const height of [0.1, 0.5, 0.98]) {
          const bounds: NormalizedContentBounds = {
            x: 0.05,
            y: (1 - height) / 2,
            width: 0.9,
            height,
            sourceAspect,
          }
          const placed = placedContent(
            fitCutoutLayer(geometry, bounds)!,
            bounds,
          )
          expect(placed.height).toBeLessThanOrEqual(geometry.maxHeight + 1e-9)
          expect(placed.width).toBeLessThanOrEqual(geometry.targetWidth + 1e-9)
        }
      }
    }
  })

  it('is unaffected by where the content sits inside its frame', () => {
    // Same garment shape, wildly different padding: it must land identically.
    const centred: NormalizedContentBounds = {
      x: 0.3,
      y: 0.3,
      width: 0.4,
      height: 0.4,
      sourceAspect: 1,
    }
    const cornered: NormalizedContentBounds = { ...centred, x: 0, y: 0 }
    const geometry = getLayerGeometry('top')

    const a = placedContent(fitCutoutLayer(geometry, centred)!, centred)
    const b = placedContent(fitCutoutLayer(geometry, cornered)!, cornered)

    expect(b.centreX).toBeCloseTo(a.centreX, 5)
    expect(b.centreY).toBeCloseTo(a.centreY, 5)
    expect(b.width).toBeCloseTo(a.width, 5)
    expect(b.height).toBeCloseTo(a.height, 5)
  })

  it('returns null for degenerate bounds instead of rendering at NaN%', () => {
    const base = shoeBounds
    expect(fitCutoutLayer(getLayerGeometry('top'), { ...base, width: 0 })).toBeNull()
    expect(fitCutoutLayer(getLayerGeometry('top'), { ...base, height: 0 })).toBeNull()
    expect(
      fitCutoutLayer(getLayerGeometry('top'), { ...base, sourceAspect: 0 }),
    ).toBeNull()
    expect(fitCutoutLayer(getLayerGeometry('top'), base, 0)).toBeNull()
  })

  it('produces finite numbers for every category and a wide range of bounds', () => {
    for (const category of Object.keys(LAYER_GEOMETRY) as Array<
      keyof typeof LAYER_GEOMETRY
    >) {
      for (const sourceAspect of [0.2, 1, 5]) {
        for (const width of [0.05, 0.5, 1]) {
          const layer = fitCutoutLayer(getLayerGeometry(category), {
            x: 0,
            y: 0,
            width,
            height: 0.5,
            sourceAspect,
          })!
          expect(Number.isFinite(layer.leftPct)).toBe(true)
          expect(Number.isFinite(layer.topPct)).toBe(true)
          expect(Number.isFinite(layer.widthPct)).toBe(true)
          expect(layer.widthPct).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('category geometry — anchored to the figure, in a sensible order', () => {
  it('places each category on the right part of the body', () => {
    const y = (c: keyof typeof LAYER_GEOMETRY) => LAYER_GEOMETRY[c].anchorY
    // Head → torso → legs → feet, top to bottom.
    expect(y('accessory')).toBeLessThan(y('top'))
    expect(y('top')).toBeLessThan(y('pants'))
    expect(y('pants')).toBeLessThan(y('shoes'))
  })

  it('keeps the shoes on the feet', () => {
    // The figure's feet occupy roughly 85.6%-89.8% of the stage height.
    expect(LAYER_GEOMETRY.shoes.anchorY).toBeGreaterThan(0.85)
    expect(LAYER_GEOMETRY.shoes.anchorY).toBeLessThan(0.92)
  })

  it('makes shoes wide enough to read as footwear', () => {
    // The regression this phase exists to fix: fitting the transparent CANVAS
    // into a 40%-wide box left a shoe far too small to recognise.
    expect(LAYER_GEOMETRY.shoes.targetWidth).toBeGreaterThan(0.3)
  })

  it('gives outerwear the widest span and the accessory the narrowest', () => {
    const widths = LAYER_GEOMETRY
    expect(widths.outerwear.targetWidth).toBeGreaterThan(widths.top.targetWidth)
    expect(widths.accessory.targetWidth).toBeLessThan(widths.shoes.targetWidth)
  })

  it('centres every category horizontally on the figure', () => {
    for (const g of Object.values(LAYER_GEOMETRY)) {
      expect(g.anchorX).toBe(0.5)
    }
  })
})

describe('ZONE_BOXES — the opaque-panel geometry that moved out of CSS', () => {
  it('keeps every zone inside the stage', () => {
    for (const [zone, box] of Object.entries(ZONE_BOXES)) {
      expect(box.x, zone).toBeGreaterThanOrEqual(0)
      expect(box.y, zone).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, zone).toBeLessThanOrEqual(1)
      expect(box.y + box.height, zone).toBeLessThanOrEqual(1)
    }
  })

  it('orders the zones down the body', () => {
    expect(ZONE_BOXES.accessory.y).toBeLessThan(ZONE_BOXES.torso.y)
    expect(ZONE_BOXES.torso.y).toBeLessThan(ZONE_BOXES.legs.y)
    expect(ZONE_BOXES.legs.y).toBeLessThan(ZONE_BOXES.feet.y)
  })

  it('nests the top inside the outerwear panel', () => {
    // The reason opaque outerwear must stack BEHIND an opaque top: their panels
    // overlap, and an opaque coat panel on top would erase the shirt entirely.
    const outer = ZONE_BOXES.torsoOuter
    const torso = ZONE_BOXES.torso
    expect(torso.x).toBeGreaterThan(outer.x)
    expect(torso.x + torso.width).toBeLessThan(outer.x + outer.width)
  })
})

describe('stacking order is unchanged by the new geometry', () => {
  it('keeps opaque outerwear behind the top', () => {
    expect(getLayerZIndex('outerwear', false)).toBeLessThan(
      getLayerZIndex('top', false),
    )
  })

  it('lifts a transparent outerwear cutout above the top', () => {
    expect(getLayerZIndex('outerwear', true)).toBeGreaterThan(
      getLayerZIndex('top', true),
    )
  })

  it('keeps the accessory above everything either way', () => {
    for (const isCutout of [false, true]) {
      for (const category of ['outerwear', 'top', 'pants', 'shoes'] as const) {
        expect(getLayerZIndex('accessory', isCutout)).toBeGreaterThan(
          getLayerZIndex(category, isCutout),
        )
      }
    }
  })
})
