import { describe, expect, it } from 'vitest'
import { analyzeGarmentMock, runGarmentAnalysis } from './mockGarmentAnalysis'
import type { ClothingCategory } from '../../domain/garmentTypes'

const CATEGORIES: ClothingCategory[] = [
  'outerwear',
  'top',
  'pants',
  'shoes',
  'accessory',
]

describe('analyzeGarmentMock', () => {
  it('returns a guess matching the GarmentAnalysisGuess shape', () => {
    const guess = analyzeGarmentMock({
      fileName: 'navy-wool-coat.jpg',
      fileSizeBytes: 12_345,
    })
    expect(CATEGORIES).toContain(guess.category)
    expect(typeof guess.color).toBe('string')
    expect(guess.colorHex).toMatch(/^#[0-9a-f]{6}$/i)
    expect(guess.styleTags.length).toBeGreaterThan(0)
    expect(guess.confidence).toBeGreaterThan(0)
    expect(guess.confidence).toBeLessThanOrEqual(1)
    expect(guess.source).toBe('mock')
  })

  it('detects category and color from keywords in the file name', () => {
    const coat = analyzeGarmentMock({ fileName: 'navy-wool-coat.jpg' })
    expect(coat.category).toBe('outerwear')
    expect(coat.color).toBe('Navy')

    const tee = analyzeGarmentMock({ fileName: 'white-boxy-tee.png' })
    expect(tee.category).toBe('top')
    expect(tee.color).toBe('Off White')

    const sneaker = analyzeGarmentMock({ fileName: 'suede-sneaker.webp' })
    expect(sneaker.category).toBe('shoes')
  })

  it('is deterministic for the same input', () => {
    const input = { fileName: 'navy-wool-coat.jpg', fileSizeBytes: 12_345 }
    expect(analyzeGarmentMock(input)).toEqual(analyzeGarmentMock(input))
  })

  it('still produces a valid guess for an opaque file name', () => {
    const guess = analyzeGarmentMock({ fileName: 'IMG_2931.heic' })
    expect(CATEGORIES).toContain(guess.category)
    expect(guess.styleTags.length).toBeGreaterThan(0)
  })

  it('always returns non-empty string tags (no undefined slots) across many inputs', () => {
    // Regression guard: a signed-shift index bug once produced `undefined` tags
    // for hashes >= 2^31, which crashed normalization on archive.
    for (let i = 0; i < 500; i += 1) {
      const guess = analyzeGarmentMock({ fileName: `piece-${i}.jpg`, fileSizeBytes: i * 13 })
      expect(guess.styleTags.length).toBeGreaterThan(0)
      for (const tag of guess.styleTags) {
        expect(typeof tag).toBe('string')
        expect(tag.length).toBeGreaterThan(0)
      }
    }
  })

  it('never fabricates a brand', () => {
    const guess = analyzeGarmentMock({ fileName: 'gucci-jacket.jpg' })
    expect(guess.brand).toBeUndefined()
  })

  it('resolves the async wrapper to the same guess', async () => {
    const input = { fileName: 'olive-cargo-pants.jpg' }
    await expect(runGarmentAnalysis(input)).resolves.toEqual(
      analyzeGarmentMock(input),
    )
  })
})
