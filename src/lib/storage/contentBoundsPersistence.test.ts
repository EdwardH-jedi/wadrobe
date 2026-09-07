// Persistence + parser tolerance for the optional `asset.contentBounds` field
// (revival Phase 2). Mirrors `proxy3dPreviewPersistence.test.ts`: an additive,
// metadata-only field must survive a round trip, must not break older records,
// and must be DROPPED rather than trusted when malformed.
//
// Bounds are stricter than most optional metadata because they are arithmetic:
// a bad url falls harmlessly through the display chain, but a bad box positions
// a garment at `NaN%` or scales it off the stage.
import { beforeEach, describe, expect, it } from 'vitest'
import { parseGarments } from './storageTypes'
import type { NormalizedContentBounds } from '../../domain/contentBounds'
import type { GarmentAsset } from '../../domain/garmentTypes'
import { makeGarment } from '../../test/factories'

const BOUNDS: NormalizedContentBounds = {
  x: 0.1,
  y: 0.35,
  width: 0.8,
  height: 0.3,
  sourceAspect: 1.25,
}

function assetWith(contentBounds: unknown): GarmentAsset {
  return {
    originalImageUrl: 'data:RAW',
    displayImageUrl: 'data:CUT',
    cutoutImageUrl: 'data:CUT',
    assetMode: 'cutout',
    contentBounds,
  } as unknown as GarmentAsset
}

/** Parse a garment the way a real reload does: through JSON. */
function roundTrip(asset: GarmentAsset) {
  const garment = makeGarment({ id: 'g', category: 'shoes', asset })
  return parseGarments(JSON.parse(JSON.stringify([garment])))
}

describe('contentBounds persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('survives a round trip intact', () => {
    const [parsed] = roundTrip(assetWith(BOUNDS))
    expect(parsed.asset?.contentBounds).toEqual(BOUNDS)
  })

  it('leaves older records without bounds untouched', () => {
    // Every garment archived before this field existed.
    const legacy = makeGarment({ id: 'g', category: 'top' })
    const parsed = parseGarments(JSON.parse(JSON.stringify([legacy])))

    expect(parsed).toHaveLength(1)
    expect(parsed[0].asset?.contentBounds).toBeUndefined()
  })

  it('keeps a cutout asset whose bounds are simply absent', () => {
    const [parsed] = roundTrip(
      assetWith(undefined as unknown as NormalizedContentBounds),
    )
    expect(parsed.asset?.assetMode).toBe('cutout')
    expect(parsed.asset?.cutoutImageUrl).toBe('data:CUT')
    expect(parsed.asset?.contentBounds).toBeUndefined()
  })
})

describe('contentBounds parser tolerance — a bad box never reaches the UI', () => {
  const corrupt: Array<[string, unknown]> = [
    ['a non-object', 'nope'],
    ['an array', [0, 0, 1, 1]],
    ['null', null],
    ['a missing field', { x: 0, y: 0, width: 0.5, sourceAspect: 1 }],
    ['a non-numeric field', { ...BOUNDS, width: '0.8' }],
    ['NaN', { ...BOUNDS, x: NaN }],
    ['a zero-area box', { ...BOUNDS, height: 0 }],
    ['a negative origin', { ...BOUNDS, x: -0.2 }],
    ['a box outside its image', { ...BOUNDS, x: 0.9, width: 0.5 }],
    ['a zero source aspect', { ...BOUNDS, sourceAspect: 0 }],
  ]

  for (const [label, value] of corrupt) {
    it(`drops ${label} and keeps the garment`, () => {
      const parsed = roundTrip(assetWith(value))

      // The garment itself is never discarded over a cosmetic field...
      expect(parsed).toHaveLength(1)
      // ...but the unusable box is gone, so the mannequin falls back to the
      // matte panel instead of doing arithmetic on it.
      expect(parsed[0].asset?.contentBounds).toBeUndefined()
      // ...and the rest of the asset is intact.
      expect(parsed[0].asset?.assetMode).toBe('cutout')
      expect(parsed[0].asset?.cutoutImageUrl).toBe('data:CUT')
    })
  }

  it('does not clone the garment when the bounds are fine', () => {
    // The surrounding sanitizer allocates lazily; the new branch must not have
    // turned the clean path into a copy on every read.
    const input = [
      makeGarment({ id: 'g', category: 'shoes', asset: assetWith(BOUNDS) }),
    ]
    const [parsed] = parseGarments(input)
    expect(parsed).toBe(input[0])
  })

  it('still drops a whole asset that is not an object at all', () => {
    // The pre-existing guard must not have been weakened by the new branch.
    const garment = { ...makeGarment({ id: 'g' }), asset: 'nope' }
    const parsed = parseGarments(JSON.parse(JSON.stringify([garment])))

    expect(parsed).toHaveLength(1)
    expect(parsed[0].asset).toBeUndefined()
  })
})
