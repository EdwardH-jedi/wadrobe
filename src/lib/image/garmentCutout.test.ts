import { describe, expect, it } from 'vitest'
import {
  analyzeBorder,
  attemptGarmentCutout,
  classifyRemoval,
  CUTOUT_REASONS,
  CUTOUT_WARNING_QUALITY,
  removeBackground,
  type CutoutDeps,
  type RasterImage,
} from './garmentCutout'
import { FORBIDDEN_CLAIM_TERMS } from '../../test/honesty'

// --- synthetic raster helpers (no canvas needed) -----------------------------
function makeRaster(
  w: number,
  h: number,
  fill: (x: number, y: number) => [number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4
      const [r, g, b] = fill(x, y)
      data[p] = r
      data[p + 1] = g
      data[p + 2] = b
      data[p + 3] = 255
    }
  }
  return { data, width: w, height: h }
}
const W = 250
// A clean flat-lay: white background with a dark 10×10 garment in the centre.
const flatLay = () =>
  makeRaster(24, 24, (x, y) =>
    x >= 7 && x < 17 && y >= 7 && y < 17 ? [22, 26, 30] : [W, W, W],
  )
// A busy/noisy background (no clear edge color).
const busy = () =>
  makeRaster(20, 20, (x, y) => [
    (x * 53) % 256,
    (y * 97) % 256,
    ((x + y) * 131) % 256,
  ])
// An image that is entirely background (no subject to keep).
const allBackground = () => makeRaster(20, 20, () => [W, W, W])

const deps = (
  raster: RasterImage | null | (() => never),
  encoded: string | null = 'data:image/webp;base64,FAKECUTOUT',
): CutoutDeps => ({
  rasterize: async () => {
    if (typeof raster === 'function') return raster()
    return raster
  },
  encode: () => encoded,
})

describe('removeBackground (pure flood fill)', () => {
  it('turns the connected flat-lay background transparent and keeps the garment', () => {
    const r = flatLay()
    const res = removeBackground(r.data, r.width, r.height)
    expect(res.applied).toBe(true)
    expect(res.removedFraction).toBeGreaterThan(0.5)
    expect(res.removedFraction).toBeLessThan(0.92)
    // corner (background) is transparent; centre (garment) stays opaque
    expect(r.data[0 * 4 + 3]).toBe(0)
    const centre = (12 * r.width + 12) * 4
    expect(r.data[centre + 3]).toBe(255)
  })

  it('bails (applied=false) when the border is not a uniform background', () => {
    const r = busy()
    const res = removeBackground(r.data, r.width, r.height)
    expect(res.applied).toBe(false)
    expect(res.removedFraction).toBe(0)
  })

  it('analyzeBorder reports high uniformity for a flat-lay, low for noise', () => {
    const fl = flatLay()
    const bs = busy()
    expect(analyzeBorder(fl.data, fl.width, fl.height).uniformity).toBeGreaterThan(0.9)
    expect(analyzeBorder(bs.data, bs.width, bs.height).uniformity).toBeLessThan(0.82)
  })
})

describe('classifyRemoval', () => {
  it('flags too-little and too-much removal as failed', () => {
    expect(classifyRemoval(0.01)).toBe('failed')
    expect(classifyRemoval(0.99)).toBe('failed')
    expect(classifyRemoval(0.6)).toBe('success')
  })
})

describe('attemptGarmentCutout', () => {
  it('SUCCESS: produces a cutout image only when a real cutout was made', async () => {
    const res = await attemptGarmentCutout('img', deps(flatLay()))
    expect(res.status).toBe('success')
    if (res.status === 'success') {
      expect(res.cutoutImageUrl).toBe('data:image/webp;base64,FAKECUTOUT')
      expect(res.source).toBe('local-flood-fill')
      expect(res.warnings?.[0]).toBe(CUTOUT_WARNING_QUALITY)
    }
  })

  it('UNAVAILABLE: busy background is non-blocking', async () => {
    const res = await attemptGarmentCutout('img', deps(busy()))
    expect(res.status).toBe('unavailable')
    if (res.status === 'unavailable')
      expect(res.reason).toBe(CUTOUT_REASONS.busyBackground)
  })

  it('UNAVAILABLE: no canvas (rasterize returns null)', async () => {
    const res = await attemptGarmentCutout('img', deps(null))
    expect(res.status).toBe('unavailable')
    if (res.status === 'unavailable')
      expect(res.reason).toBe(CUTOUT_REASONS.canvasUnavailable)
  })

  it('FAILED: decode error never throws into the caller', async () => {
    const res = await attemptGarmentCutout(
      'img',
      deps(() => {
        throw new Error('decode')
      }),
    )
    expect(res.status).toBe('failed')
    if (res.status === 'failed')
      expect(res.reason).toBe(CUTOUT_REASONS.decodeFailed)
  })

  it('FAILED: no subject (whole image is background → over-removed)', async () => {
    const res = await attemptGarmentCutout('img', deps(allBackground()))
    expect(res.status).toBe('failed')
    if (res.status === 'failed')
      expect(res.reason).toBe(CUTOUT_REASONS.noSubject)
  })

  it('never returns success when encoding fails', async () => {
    const res = await attemptGarmentCutout('img', deps(flatLay(), null))
    expect(res.status).toBe('unavailable')
  })

  it('FAILED: an encoder exception never throws into the caller', async () => {
    const res = await attemptGarmentCutout('img', {
      rasterize: async () => flatLay(),
      encode: () => {
        throw new Error('encode')
      },
    })
    expect(res.status).toBe('failed')
    if (res.status === 'failed')
      expect(res.reason).toBe(CUTOUT_REASONS.encodeFailed)
  })
})

describe('cutout copy honesty', () => {
  it('no reason/warning implies AI, product recognition, or 3D try-on', () => {
    const strings = [...Object.values(CUTOUT_REASONS), CUTOUT_WARNING_QUALITY]
    for (const s of strings) expect(s).not.toMatch(FORBIDDEN_CLAIM_TERMS)
  })
})

describe('attemptGarmentCutout — measured content bounds (revival Phase 2)', () => {
  it('reports where the garment sits inside the cutout it just made', async () => {
    // The 24x24 flat-lay has a 10x10 subject at (7,7). After the flood fill,
    // that subject is the only opaque thing left — so the bounds describe it.
    const res = await attemptGarmentCutout('img', deps(flatLay()))

    expect(res.status).toBe('success')
    if (res.status !== 'success') return
    expect(res.contentBounds).toEqual({
      x: 7 / 24,
      y: 7 / 24,
      width: 10 / 24,
      height: 10 / 24,
      sourceAspect: 1,
    })
  })

  it('measures the cutout, not the original photo', async () => {
    // The distinction the whole phase rests on: before the fill the frame is
    // fully opaque (bounds would be the whole image); after it, only the
    // garment remains. A subject filling under half the frame proves the
    // measurement happened on the right side of the fill.
    const res = await attemptGarmentCutout('img', deps(flatLay()))
    if (res.status !== 'success') throw new Error('expected success')

    expect(res.contentBounds!.width).toBeLessThan(0.5)
  })

  it('needs no extra canvas pass to do it', async () => {
    // Bounds come from the raster already in hand. A second rasterize would be
    // a wasted decode on every accepted cutout.
    let rasterizeCalls = 0
    const counting: CutoutDeps = {
      rasterize: async () => {
        rasterizeCalls++
        return flatLay()
      },
      encode: () => 'data:image/webp;base64,FAKECUTOUT',
    }

    const res = await attemptGarmentCutout('img', counting)

    expect(res.status).toBe('success')
    expect(rasterizeCalls).toBe(1)
  })

  it('omits bounds rather than inventing them when nothing is measurable', async () => {
    // A subject too small to trust. The cutout itself is unaffected; the
    // mannequin simply falls back to its un-fitted presentation.
    const speck = makeRaster(200, 200, (x, y) =>
      x === 100 && y === 100 ? [10, 10, 10] : [W, W, W],
    )
    const res = await attemptGarmentCutout('img', deps(speck))

    // One dark pixel in 40,000 is below the flood fill's own floor, so this
    // honestly fails before it ever reaches the measurement.
    expect(res.status).toBe('failed')
  })
})
