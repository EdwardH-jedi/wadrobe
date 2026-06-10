import { describe, expect, it } from 'vitest'
import {
  emptyGarmentDraft,
  garmentToDraft,
  isNameMissing,
  normalizeDraft,
} from './garmentDraft'
import { buildUploadedAsset } from './garmentAsset'
import { COLOR_OPTIONS } from './garmentTaxonomy'
import { makeGarment } from '../test/factories'

// normalizeDraft is the single normalization point that runs on every archive
// (UploadGarmentModal.handleArchive) and every edit (GarmentEditor) before a
// draft becomes a stored garment. It had no direct coverage.
describe('emptyGarmentDraft', () => {
  it('seeds a valid, blank draft with a real palette color', () => {
    const draft = emptyGarmentDraft()
    expect(draft.name).toBe('')
    expect(draft.category).toBe('top')
    expect(draft.color).toBe('Charcoal')
    expect(COLOR_OPTIONS.some((c) => c.hex === draft.colorHex)).toBe(true)
    expect(draft.styleTags).toEqual([])
    expect(draft.brand).toBeUndefined()
    expect(draft.notes).toBeUndefined()
    expect(draft.imageDataUrl).toBe('')
  })

  it('carries an image data url through', () => {
    expect(emptyGarmentDraft('data:image/png;base64,xx').imageDataUrl).toBe(
      'data:image/png;base64,xx',
    )
  })
})

describe('normalizeDraft', () => {
  it('defaults a blank name and trims a real one', () => {
    expect(normalizeDraft({ ...emptyGarmentDraft(), name: '   ' }).name).toBe(
      'Untitled Piece',
    )
    expect(
      normalizeDraft({ ...emptyGarmentDraft(), name: '  Wool Coat  ' }).name,
    ).toBe('Wool Coat')
  })

  it('collapses blank brand/notes to undefined and trims real ones', () => {
    const blank = normalizeDraft({
      ...emptyGarmentDraft(),
      brand: '   ',
      notes: '',
    })
    expect(blank.brand).toBeUndefined()
    expect(blank.notes).toBeUndefined()

    const filled = normalizeDraft({
      ...emptyGarmentDraft(),
      brand: '  Acme ',
      notes: '  warm ',
    })
    expect(filled.brand).toBe('Acme')
    expect(filled.notes).toBe('warm')
  })

  it('trims, lowercases, dedupes and drops blank style tags (order preserved)', () => {
    const out = normalizeDraft({
      ...emptyGarmentDraft(),
      styleTags: ['  Minimal ', 'minimal', 'MINIMAL', '', '   ', ' Tailored'],
    })
    expect(out.styleTags).toEqual(['minimal', 'tailored'])
  })

  it('passes category/color/colorHex/imageDataUrl through unchanged', () => {
    const out = normalizeDraft({
      ...emptyGarmentDraft('data:img'),
      category: 'pants',
      color: 'Navy',
      colorHex: '#23303f',
    })
    expect(out.category).toBe('pants')
    expect(out.color).toBe('Navy')
    expect(out.colorHex).toBe('#23303f')
    expect(out.imageDataUrl).toBe('data:img')
  })
})

describe('isNameMissing', () => {
  it('treats blank and whitespace-only names as missing', () => {
    expect(isNameMissing('')).toBe(true)
    expect(isNameMissing('   ')).toBe(true)
    expect(isNameMissing('\t\n')).toBe(true)
  })

  it('accepts any name with non-whitespace content', () => {
    expect(isNameMissing('Coat')).toBe(false)
    expect(isNameMissing('  Wool Coat  ')).toBe(false)
  })
})

describe('garmentToDraft', () => {
  it('copies styleTags into a fresh array (editing the draft cannot mutate the source)', () => {
    const garment = makeGarment({ styleTags: ['minimal'] })
    const draft = garmentToDraft(garment)
    draft.styleTags.push('mutated')
    expect(garment.styleTags).toEqual(['minimal'])
  })

  it('copies the asset (and leaves it undefined when the garment has none)', () => {
    const withAsset = makeGarment({ asset: buildUploadedAsset('data:y') })
    expect(garmentToDraft(withAsset).asset?.displayImageUrl).toBe('data:y')
    expect(garmentToDraft(makeGarment()).asset).toBeUndefined()
  })
})

describe('normalizeDraft — asset (Phase 8)', () => {
  it('guarantees a display image and trims source fields', () => {
    const out = normalizeDraft({
      ...emptyGarmentDraft('data:orig'),
      name: 'X',
      asset: {
        originalImageUrl: 'data:orig',
        displayImageUrl: '', // empty → falls back to original
        sourceUrl: '  https://x  ',
        sourceLabel: '  Label  ',
        productReferenceImageUrl: '   ', // blank → undefined
        assetMode: 'uploaded',
      },
    })
    expect(out.asset?.displayImageUrl).toBe('data:orig')
    expect(out.asset?.sourceUrl).toBe('https://x')
    expect(out.asset?.sourceLabel).toBe('Label')
    expect(out.asset?.productReferenceImageUrl).toBeUndefined()
  })

  it('leaves the asset undefined for a draft without one', () => {
    expect(normalizeDraft(emptyGarmentDraft('data:x')).asset).toBeUndefined()
  })
})
