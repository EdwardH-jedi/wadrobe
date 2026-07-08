import { describe, expect, it } from 'vitest'
import {
  buildUploadedAsset,
  getGarmentDisplayImage,
  getGarmentMannequinImage,
  mannequinShowsCutout,
} from './garmentAsset'
import type { GarmentAsset } from './garmentTypes'

describe('getGarmentDisplayImage', () => {
  it('prefers the asset display image', () => {
    expect(
      getGarmentDisplayImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'display',
          assetMode: 'product-reference',
        },
      }),
    ).toBe('display')
  })

  it('renders an ACCEPTED cutout (display points at it, assetMode cutout)', () => {
    // Accepting a cutout sets displayImageUrl = cutoutImageUrl in lockstep with
    // assetMode 'cutout', so the cutout renders via the authoritative display.
    expect(
      getGarmentDisplayImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'cutout',
          croppedImageUrl: 'cropped',
          cutoutImageUrl: 'cutout',
          assetMode: 'cutout',
        },
      }),
    ).toBe('cutout')
  })

  it('a product-reference display is NOT shadowed by a stored cutout (Phase 8 preserved)', () => {
    // The key Phase-10 precedence guard: a garment that has a generated/stored
    // cutout but whose user-chosen display is a product reference must render the
    // REFERENCE, never the cutout.
    expect(
      getGarmentDisplayImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'reference',
          croppedImageUrl: 'cropped',
          cutoutImageUrl: 'cutout',
          productReferenceImageUrl: 'reference',
          assetMode: 'product-reference',
        },
      }),
    ).toBe('reference')
  })

  it('falls back to a cutout only when display is empty (defensive)', () => {
    expect(
      getGarmentDisplayImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: '',
          cutoutImageUrl: 'cutout',
          assetMode: 'cutout',
        },
      }),
    ).toBe('cutout')
  })

  it('renders the crop when the display image points at it (assetMode cropped)', () => {
    // The crop step sets displayImageUrl = croppedImageUrl, so the crop renders
    // via the authoritative display field.
    expect(
      getGarmentDisplayImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'cropped',
          croppedImageUrl: 'cropped',
          assetMode: 'cropped',
        },
      }),
    ).toBe('cropped')
  })

  it('a product-reference display is NOT shadowed by a stored crop (Phase 8 preserved)', () => {
    // Regression guard: the user cropped, then chose a product-reference image as
    // the display. The explicit reference choice must win over the stored crop.
    expect(
      getGarmentDisplayImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'reference',
          croppedImageUrl: 'cropped',
          productReferenceImageUrl: 'reference',
          assetMode: 'product-reference',
        },
      }),
    ).toBe('reference')
  })

  it('falls back to the crop when display is empty', () => {
    expect(
      getGarmentDisplayImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: '',
          croppedImageUrl: 'cropped',
          assetMode: 'cropped',
        },
      }),
    ).toBe('cropped')
  })

  it('falls back to the asset original image when display is empty', () => {
    expect(
      getGarmentDisplayImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: '',
          assetMode: 'uploaded',
        },
      }),
    ).toBe('orig')
  })

  it('falls back to imageDataUrl when there is no asset (backward compatible)', () => {
    expect(getGarmentDisplayImage({ imageDataUrl: 'fallback' })).toBe('fallback')
  })

  it('tolerates a malformed/junk persisted asset without throwing', () => {
    const junk = {
      imageDataUrl: 'fallback',
      asset: 'nonsense' as unknown as GarmentAsset,
    }
    expect(getGarmentDisplayImage(junk)).toBe('fallback')

    const empty = { imageDataUrl: 'fallback', asset: {} as GarmentAsset }
    expect(getGarmentDisplayImage(empty)).toBe('fallback')
  })

  it('ignores a non-string url field (corrupt data) and falls through', () => {
    const corrupt = {
      imageDataUrl: 'fallback',
      asset: {
        originalImageUrl: 'orig',
        displayImageUrl: 42 as unknown as string, // wrong type
        assetMode: 'uploaded',
      } as GarmentAsset,
    }
    expect(getGarmentDisplayImage(corrupt)).toBe('orig')
  })
})

describe('getGarmentMannequinImage (Avatar Visual 1a)', () => {
  it('prefers the mannequin cutout over the normal display image', () => {
    // The decoupled case: the archive display stays the ORIGINAL photo while the
    // mannequin uses the background-removed cutout.
    expect(
      getGarmentMannequinImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'orig',
          mannequinCutoutUrl: 'mcut',
          assetMode: 'uploaded',
        },
      }),
    ).toBe('mcut')
  })

  it('falls back to the display image when there is no mannequin cutout (legacy safe)', () => {
    expect(
      getGarmentMannequinImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'display',
          assetMode: 'product-reference',
        },
      }),
    ).toBe('display')
  })

  it('falls back to imageDataUrl for a legacy garment with no asset', () => {
    expect(getGarmentMannequinImage({ imageDataUrl: 'fallback' })).toBe('fallback')
  })

  it('ignores a non-string mannequin cutout and falls through', () => {
    expect(
      getGarmentMannequinImage({
        imageDataUrl: 'fallback',
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'display',
          mannequinCutoutUrl: 7 as unknown as string,
          assetMode: 'uploaded',
        },
      }),
    ).toBe('display')
  })
})

describe('mannequinShowsCutout', () => {
  it('is true when a mannequin cutout is present (even if not the global display)', () => {
    expect(
      mannequinShowsCutout({
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'orig',
          mannequinCutoutUrl: 'mcut',
          assetMode: 'uploaded',
        },
      }),
    ).toBe(true)
  })

  it('is true for an accepted global cutout (assetMode cutout)', () => {
    expect(
      mannequinShowsCutout({
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'cut',
          assetMode: 'cutout',
        },
      }),
    ).toBe(true)
  })

  it('is false for a plain uploaded garment and for a legacy no-asset garment', () => {
    expect(
      mannequinShowsCutout({
        asset: {
          originalImageUrl: 'orig',
          displayImageUrl: 'orig',
          assetMode: 'uploaded',
        },
      }),
    ).toBe(false)
    expect(mannequinShowsCutout({})).toBe(false)
  })
})

describe('buildUploadedAsset', () => {
  it('builds an uploaded asset whose display equals the original', () => {
    const a = buildUploadedAsset('data:x')
    expect(a.assetMode).toBe('uploaded')
    expect(a.originalImageUrl).toBe('data:x')
    expect(a.displayImageUrl).toBe('data:x')
  })
})
