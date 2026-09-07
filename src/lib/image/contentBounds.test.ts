import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ALPHA_THRESHOLD,
  computeContentBounds,
  isNormalizedContentBounds,
  type NormalizedContentBounds,
} from './contentBounds'
import type { RasterImage } from './garmentCutout'

/** Build an RGBA raster whose opaque pixels are chosen by a predicate. */
function raster(
  width: number,
  height: number,
  opaque: (x: number, y: number) => boolean | number,
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4
      const a = opaque(x, y)
      data[p] = 200
      data[p + 1] = 180
      data[p + 2] = 160
      data[p + 3] = a === true ? 255 : a === false ? 0 : (a as number)
    }
  }
  return { data, width, height }
}

describe('computeContentBounds — where is the garment inside the frame', () => {
  it('finds a subject sitting in the middle of a transparent canvas', () => {
    // A 4x4 opaque block at (2,3) inside a 10x10 frame — the shape of every
    // real cutout: a garment surrounded by nothing.
    const image = raster(
      10,
      10,
      (x, y) => x >= 2 && x < 6 && y >= 3 && y < 7,
    )

    expect(computeContentBounds(image)).toEqual({
      x: 0.2,
      y: 0.3,
      width: 0.4,
      height: 0.4,
      sourceAspect: 1,
    })
  })

  it('measures inclusive pixel spans, so a one-pixel subject is one pixel wide', () => {
    // The off-by-one that matters: a subject occupying only column 3 spans one
    // pixel, not zero, and a zero-width box divides to infinity downstream.
    const image = raster(10, 10, (x, y) => x === 3 && y === 4)

    expect(computeContentBounds(image)).toEqual({
      x: 0.3,
      y: 0.4,
      width: 0.1,
      height: 0.1,
      sourceAspect: 1,
    })
  })

  it('returns the whole frame for a fully opaque image', () => {
    // The legacy/degenerate case: nothing was removed, so nothing is croppable.
    expect(computeContentBounds(raster(8, 8, () => true))).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      sourceAspect: 1,
    })
  })

  it('returns null for a fully transparent image', () => {
    expect(computeContentBounds(raster(8, 8, () => false))).toBeNull()
  })

  it('records the source aspect of a non-square image', () => {
    // A wide shoe photo. Without this ratio the renderer cannot convert a
    // horizontal fraction into a vertical one.
    const wide = raster(40, 10, (x) => x >= 10 && x < 30)
    const bounds = computeContentBounds(wide)

    expect(bounds?.sourceAspect).toBe(4)
    expect(bounds?.width).toBe(0.5)
    expect(bounds?.height).toBe(1)
  })

  it('finds the leftmost pixel even when it is on a different row', () => {
    // Guards the loop shape: a per-row shortcut would miss this.
    const image = raster(
      10,
      10,
      (x, y) => (y === 2 && x === 7) || (y === 8 && x === 1),
    )
    const bounds = computeContentBounds(image)

    expect(bounds?.x).toBe(0.1)
    expect(bounds?.y).toBe(0.2)
    expect(bounds?.width).toBeCloseTo(0.7)
    expect(bounds?.height).toBeCloseTo(0.7)
  })
})

describe('computeContentBounds — alpha threshold', () => {
  it('ignores near-transparent compression noise', () => {
    // WebP is lossy: pixels the flood fill zeroed come back as 1-3. Measuring
    // those would return the whole frame for every cutout.
    const noisy = raster(10, 10, (x, y) => {
      if (x >= 4 && x < 7 && y >= 4 && y < 7) return true
      return 3
    })

    expect(computeContentBounds(noisy)).toMatchObject({
      x: 0.4,
      y: 0.4,
      width: 0.3,
      height: 0.3,
    })
  })

  it('honours an explicit threshold', () => {
    const faint = raster(10, 10, (x, y) =>
      x >= 4 && x < 7 && y >= 4 && y < 7 ? 20 : 0,
    )

    // Above the default threshold, so the faint subject is found...
    expect(computeContentBounds(faint)).not.toBeNull()
    // ...and a caller demanding near-opacity correctly finds nothing.
    expect(computeContentBounds(faint, 200)).toBeNull()
  })

  it('treats exactly-at-threshold alpha as background', () => {
    const atThreshold = raster(10, 10, () => DEFAULT_ALPHA_THRESHOLD)
    expect(computeContentBounds(atThreshold)).toBeNull()
  })
})

describe('computeContentBounds — malformed input never throws', () => {
  it('rejects zero and negative dimensions', () => {
    const data = new Uint8ClampedArray(0)
    expect(computeContentBounds({ data, width: 0, height: 0 })).toBeNull()
    expect(computeContentBounds({ data, width: -4, height: 4 })).toBeNull()
  })

  it('rejects non-integer dimensions', () => {
    const image = raster(4, 4, () => true)
    expect(
      computeContentBounds({ ...image, width: 4.5 }),
    ).toBeNull()
  })

  it('rejects a buffer that is too short for its stated dimensions', () => {
    // Reading past the end would silently measure garbage.
    const image = raster(4, 4, () => true)
    expect(
      computeContentBounds({ ...image, width: 40, height: 40 }),
    ).toBeNull()
  })

  it('rejects a subject too small to be real', () => {
    // One pixel in a 640x640 frame is noise, and fitting to it would blow that
    // speck up to fill a body zone.
    const speck = raster(200, 200, (x, y) => x === 100 && y === 100)
    expect(computeContentBounds(speck)).toBeNull()
  })
})

describe('isNormalizedContentBounds — tolerance for persisted values', () => {
  const valid: NormalizedContentBounds = {
    x: 0.2,
    y: 0.3,
    width: 0.4,
    height: 0.4,
    sourceAspect: 1,
  }

  it('accepts a well-formed record', () => {
    expect(isNormalizedContentBounds(valid)).toBe(true)
  })

  it('accepts the full frame', () => {
    expect(
      isNormalizedContentBounds({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        sourceAspect: 0.75,
      }),
    ).toBe(true)
  })

  it('rejects non-objects and nulls', () => {
    for (const value of [null, undefined, 4, 'bounds', [0, 0, 1, 1]]) {
      expect(isNormalizedContentBounds(value)).toBe(false)
    }
  })

  it('rejects missing, non-numeric and non-finite fields', () => {
    expect(isNormalizedContentBounds({ ...valid, x: undefined })).toBe(false)
    expect(isNormalizedContentBounds({ ...valid, width: '0.4' })).toBe(false)
    expect(isNormalizedContentBounds({ ...valid, y: NaN })).toBe(false)
    expect(isNormalizedContentBounds({ ...valid, height: Infinity })).toBe(false)
  })

  it('rejects a zero-area box', () => {
    // Arithmetically valid, visually catastrophic: it divides to infinity.
    expect(isNormalizedContentBounds({ ...valid, width: 0 })).toBe(false)
    expect(isNormalizedContentBounds({ ...valid, height: 0 })).toBe(false)
  })

  it('rejects a box that runs outside its own image', () => {
    expect(isNormalizedContentBounds({ ...valid, x: -0.1 })).toBe(false)
    expect(isNormalizedContentBounds({ ...valid, width: 0.9 })).toBe(false)
    expect(isNormalizedContentBounds({ ...valid, y: 0.8, height: 0.4 })).toBe(
      false,
    )
  })

  it('tolerates float round-tripping through JSON', () => {
    const roundTripped = JSON.parse(
      JSON.stringify({ x: 0, y: 0, width: 1.00001, height: 1, sourceAspect: 1 }),
    )
    expect(isNormalizedContentBounds(roundTripped)).toBe(true)
  })

  it('rejects a non-positive source aspect', () => {
    expect(isNormalizedContentBounds({ ...valid, sourceAspect: 0 })).toBe(false)
    expect(isNormalizedContentBounds({ ...valid, sourceAspect: -1 })).toBe(false)
  })

  it('accepts what computeContentBounds produces', () => {
    // The two halves of the contract must not drift apart.
    const bounds = computeContentBounds(
      raster(20, 30, (x, y) => x > 4 && x < 15 && y > 6 && y < 24),
    )
    expect(bounds).not.toBeNull()
    expect(isNormalizedContentBounds(bounds)).toBe(true)
  })
})
