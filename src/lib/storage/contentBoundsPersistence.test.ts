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
import {
  dehydrateGarmentForStorage,
  hydrateGarmentForRuntime,
} from './garmentAssetStorage'
import { reviewArchiveImport } from './archiveImport'
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

describe('contentBounds never outlive the image they describe', () => {
  const BLOB_REF = { kind: 'indexeddb-blob' as const, key: 'asset_1_x' }

  const blobBackedCutout = (): GarmentAsset => ({
    originalImageUrl: '',
    displayImageUrl: '',
    cutoutImageRef: BLOB_REF,
    assetMode: 'cutout',
    contentBounds: BOUNDS,
  })

  /** A blob store that either resolves the cutout or has lost it. */
  const store = (url: string | null) =>
    ({
      getObjectUrl: async () => url,
    }) as unknown as Parameters<typeof hydrateGarmentForRuntime>[1]

  it('keeps them when the cutout blob resolves', async () => {
    const garment = makeGarment({ id: 'g', asset: blobBackedCutout() })
    const hydrated = await hydrateGarmentForRuntime(garment, store('blob:CUT'))

    expect(hydrated.asset?.displayImageUrl).toBe('blob:CUT')
    expect(hydrated.asset?.contentBounds).toEqual(BOUNDS)
  })

  it('drops them when the blob is gone and the thumbnail renders instead', async () => {
    // The degraded case. The thumbnail is an OPAQUE jpeg; bounds measured from
    // a transparent cutout describe a different picture entirely, and using
    // them would scale that thumbnail into a misplaced rectangle over the
    // figure. Without them the mannequin correctly falls back to its panel.
    const garment = makeGarment({
      id: 'g',
      imageDataUrl: 'data:THUMB',
      asset: blobBackedCutout(),
    })
    const hydrated = await hydrateGarmentForRuntime(garment, store(null))

    expect(hydrated.asset?.displayImageUrl).toBe('data:THUMB')
    expect(hydrated.asset?.contentBounds).toBeUndefined()
    // The piece itself still renders — degradation, not data loss.
    expect(hydrated.asset?.assetMode).toBe('cutout')
  })

  it('drops them when a product reference outranks the cutout', async () => {
    // Precedence is unchanged: an explicit reference wins, and the cutout's
    // bounds must not be applied to it.
    const garment = makeGarment({
      id: 'g',
      asset: {
        ...blobBackedCutout(),
        assetMode: 'product-reference',
        productReferenceImageUrl: 'https://example.test/ref.jpg',
      },
    })
    const hydrated = await hydrateGarmentForRuntime(garment, store('blob:CUT'))

    expect(hydrated.asset?.displayImageUrl).toBe('https://example.test/ref.jpg')
    expect(hydrated.asset?.contentBounds).toBeUndefined()
  })

  it('survives dehydration for storage', async () => {
    // The persist side must not silently strip the field.
    const garment = makeGarment({ id: 'g', asset: blobBackedCutout() })
    const lean = dehydrateGarmentForStorage(garment)

    expect(lean.asset?.contentBounds).toEqual(BOUNDS)
  })
})

describe('contentBounds survive a backup export/import round trip', () => {
  it('arrives intact through the real import review', () => {
    // Backup files are how an archive moves between machines. A field the
    // exporter writes and the importer silently drops would lose the fitting
    // on every restored piece.
    const garment = makeGarment({
      id: 'g',
      category: 'shoes',
      asset: assetWith(BOUNDS),
    })
    const document = {
      kind: 'fit-archive.archive',
      schemaVersion: 1,
      assetEncoding: 'inline-data-url',
      exportedAt: Date.now(),
      garments: [garment],
      savedOutfits: [],
      currentOutfit: {
        outerwear: null,
        top: null,
        pants: null,
        shoes: 'g',
        accessory: null,
      },
    }

    const review = reviewArchiveImport(JSON.parse(JSON.stringify(document)))

    expect(review.ok).toBe(true)
    expect(review.garments[0].asset?.contentBounds).toEqual(BOUNDS)
  })

  it('drops a corrupt box on import too, without losing the piece', () => {
    // The import path runs the same parser, so a hand-edited backup file
    // cannot smuggle in arithmetic that breaks the mannequin.
    const garment = makeGarment({
      id: 'g',
      category: 'shoes',
      asset: assetWith({ ...BOUNDS, width: 'wide' }),
    })
    const review = reviewArchiveImport(
      JSON.parse(
        JSON.stringify({
          kind: 'fit-archive.archive',
          schemaVersion: 1,
          assetEncoding: 'inline-data-url',
          exportedAt: Date.now(),
          garments: [garment],
          savedOutfits: [],
          currentOutfit: {
            outerwear: null,
            top: null,
            pants: null,
            shoes: 'g',
            accessory: null,
          },
        }),
      ),
    )

    expect(review.ok).toBe(true)
    expect(review.garments).toHaveLength(1)
    expect(review.garments[0].asset?.contentBounds).toBeUndefined()
  })
})
