// Phase 4: pure vision helpers — response normalization, brand non-fabrication,
// colorHex fallback, and the data-URL splitter.
import { describe, expect, it } from 'vitest'
import {
  dataUrlToImageSource,
  parseVisionGuess,
} from './visionAnalysis'

describe('dataUrlToImageSource', () => {
  it('splits a base64 image data URL into media type + data', () => {
    expect(dataUrlToImageSource('data:image/jpeg;base64,QUJD')).toEqual({
      mediaType: 'image/jpeg',
      data: 'QUJD',
    })
  })

  it('rejects non-image or non-base64 URLs', () => {
    expect(dataUrlToImageSource('data:text/plain;base64,QUJD')).toBeNull()
    expect(dataUrlToImageSource('https://x/y.jpg')).toBeNull()
    expect(dataUrlToImageSource('data:image/png;base64,')).toBeNull()
  })
})

describe('parseVisionGuess', () => {
  it('normalizes a well-formed provider result with source vision-api', () => {
    const guess = parseVisionGuess({
      category: 'outerwear',
      color: '  Navy ',
      colorHex: '#1B2A4A',
      styleTags: ['Tailored', 'WOOL', '', 'archival', 'extra'],
      confidence: 0.91,
      brand: 'Maison Grey',
    })
    expect(guess).toEqual({
      category: 'outerwear',
      color: 'Navy',
      colorHex: '#1B2A4A',
      styleTags: ['tailored', 'wool', 'archival'], // lowercased, blanks dropped, capped at 3
      confidence: 0.91,
      source: 'vision-api',
      brand: 'Maison Grey',
    })
  })

  it('returns null when the category is missing or invalid (caller falls back to mock)', () => {
    expect(parseVisionGuess({ category: 'hat', color: 'Black', colorHex: '#000000' })).toBeNull()
    expect(parseVisionGuess({ color: 'Black' })).toBeNull()
    expect(parseVisionGuess('nope')).toBeNull()
  })

  it('falls back colorHex to the dominant color, then a neutral default', () => {
    expect(
      parseVisionGuess({ category: 'top', colorHex: 'not-a-hex' }, '#445566')?.colorHex,
    ).toBe('#445566')
    expect(parseVisionGuess({ category: 'top' })?.colorHex).toBe('#2b2b30')
  })

  it('never fabricates a brand and clamps confidence', () => {
    const noBrand = parseVisionGuess({ category: 'shoes', brand: '   ', confidence: 5 })
    expect(noBrand?.brand).toBeUndefined()
    expect(noBrand?.confidence).toBe(1)
    const defaulted = parseVisionGuess({ category: 'top' })
    expect(defaulted?.confidence).toBe(0.7)
    expect(defaulted?.styleTags).toEqual([])
  })
})
