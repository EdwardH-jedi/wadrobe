import { describe, expect, it } from 'vitest'
import {
  clampCropRect,
  cropRectFromControls,
  cropRectToPixels,
  IDENTITY_CROP_CONTROLS,
  isIdentityCrop,
  MAX_CROP_ZOOM,
  MIN_CROP_FRACTION,
  validateCropRect,
  type CropRect,
} from './cropGeometry'

describe('cropRectFromControls', () => {
  it('maps the identity controls to the whole image', () => {
    const rect = cropRectFromControls(IDENTITY_CROP_CONTROLS)
    expect(isIdentityCrop(rect)).toBe(true)
    expect(rect).toMatchObject({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('zoom shrinks the window and centers it with centered offsets', () => {
    const rect = cropRectFromControls({ zoom: 2, offsetX: 0.5, offsetY: 0.5 })
    expect(rect.width).toBeCloseTo(0.5)
    expect(rect.height).toBeCloseTo(0.5)
    expect(rect.x).toBeCloseTo(0.25)
    expect(rect.y).toBeCloseTo(0.25)
  })

  it('offsets pan the window to the edges without leaving the image', () => {
    const rect = cropRectFromControls({ zoom: 2, offsetX: 0, offsetY: 1 })
    expect(rect.x).toBeCloseTo(0)
    expect(rect.y).toBeCloseTo(0.5)
    expect(validateCropRect(rect)).toBe(true)
  })

  it('clamps zoom into [1, MAX_CROP_ZOOM]', () => {
    expect(cropRectFromControls({ zoom: 99, offsetX: 0.5, offsetY: 0.5 }).width)
      .toBeCloseTo(1 / MAX_CROP_ZOOM)
    expect(cropRectFromControls({ zoom: 0.1, offsetX: 0.5, offsetY: 0.5 }).width)
      .toBeCloseTo(1)
  })

  it('collapses non-finite controls to the identity crop', () => {
    const rect = cropRectFromControls({
      zoom: NaN,
      offsetX: Infinity,
      offsetY: NaN,
    })
    expect(validateCropRect(rect)).toBe(true)
    expect(isIdentityCrop(rect)).toBe(true)
  })
})

describe('validateCropRect', () => {
  it('accepts a valid in-bounds rect', () => {
    expect(validateCropRect({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 })).toBe(
      true,
    )
  })

  it('rejects out-of-bounds, too-small, and non-finite rects', () => {
    expect(validateCropRect({ x: 0.8, y: 0, width: 0.5, height: 0.5 })).toBe(
      false,
    ) // x + width > 1
    expect(
      validateCropRect({ x: 0, y: 0, width: MIN_CROP_FRACTION / 2, height: 0.5 }),
    ).toBe(false) // too small
    expect(validateCropRect({ x: -0.2, y: 0, width: 0.5, height: 0.5 })).toBe(
      false,
    )
    expect(
      validateCropRect({ x: NaN, y: 0, width: 0.5, height: 0.5 }),
    ).toBe(false)
  })
})

describe('clampCropRect', () => {
  it('pulls an overflowing rect back into bounds', () => {
    const clamped = clampCropRect({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 })
    expect(validateCropRect(clamped)).toBe(true)
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1 + 1e-6)
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(1 + 1e-6)
  })

  it('enforces the minimum crop fraction and repairs non-finite input', () => {
    const tiny = clampCropRect({ x: 0, y: 0, width: 0.001, height: 0.001 })
    expect(tiny.width).toBeGreaterThanOrEqual(MIN_CROP_FRACTION)
    expect(tiny.height).toBeGreaterThanOrEqual(MIN_CROP_FRACTION)

    const junk = clampCropRect({
      x: NaN,
      y: NaN,
      width: NaN,
      height: NaN,
    } as CropRect)
    expect(validateCropRect(junk)).toBe(true)
  })
})

describe('cropRectToPixels', () => {
  it('maps a centered half-crop onto image pixels', () => {
    const px = cropRectToPixels(
      { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      400,
      200,
    )
    expect(px).toEqual({ sx: 100, sy: 50, sw: 200, sh: 100 })
  })

  it('never produces an out-of-bounds or empty source rect', () => {
    const px = cropRectToPixels(
      { x: 0.95, y: 0.95, width: 0.5, height: 0.5 },
      100,
      100,
    )
    expect(px.sx + px.sw).toBeLessThanOrEqual(100)
    expect(px.sy + px.sh).toBeLessThanOrEqual(100)
    expect(px.sw).toBeGreaterThanOrEqual(1)
    expect(px.sh).toBeGreaterThanOrEqual(1)
  })
})
