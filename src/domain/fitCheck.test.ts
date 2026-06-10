import { describe, expect, it } from 'vitest'
import { generateFitCheck } from './fitCheck'
import { makeGarment } from '../test/factories'

describe('generateFitCheck', () => {
  it('reports an empty look', () => {
    const result = generateFitCheck([])
    expect(result.rating).toBe('Empty')
    expect(result.filledSlots).toBe(0)
    expect(result.totalSlots).toBe(5)
    expect(result.completeness).toBe(0)
    expect(result.palette).toEqual([])
    expect(result.toneLabel).toBe('None')
    expect(result.notes.length).toBeGreaterThan(0)
  })

  it('returns the expected result shape for a populated look', () => {
    const result = generateFitCheck([
      makeGarment({ category: 'top', color: 'Off White', colorHex: '#ece8e1' }),
      makeGarment({ category: 'pants', color: 'Black', colorHex: '#16161a' }),
    ])
    expect(result).toEqual(
      expect.objectContaining({
        filledSlots: 2,
        totalSlots: 5,
        completeness: 0.4,
      }),
    )
    expect(Array.isArray(result.palette)).toBe(true)
    expect(Array.isArray(result.dominantTags)).toBe(true)
    expect(typeof result.styleLabel).toBe('string')
  })

  it('recognizes a disciplined all-neutral palette', () => {
    const result = generateFitCheck([
      makeGarment({ category: 'top', color: 'Off White', colorHex: '#ece8e1' }),
      makeGarment({ category: 'pants', color: 'Charcoal', colorHex: '#2b2b30' }),
      makeGarment({ category: 'shoes', color: 'Walnut', colorHex: '#6b4a33' }),
    ])
    expect(result.toneLabel).toBe('Tonal neutrals')
    expect(result.rating).toBe('Strong')
    expect(result.palette).toHaveLength(3)
  })

  it('rates a four-plus-piece look as Editorial', () => {
    const result = generateFitCheck([
      makeGarment({ category: 'outerwear' }),
      makeGarment({ category: 'top' }),
      makeGarment({ category: 'pants' }),
      makeGarment({ category: 'shoes' }),
    ])
    expect(result.rating).toBe('Editorial')
    expect(result.completeness).toBeCloseTo(0.8)
  })
})

describe('generateFitCheck — vibe label', () => {
  it('is "Unstyled" for an empty outfit', () => {
    expect(generateFitCheck([]).vibe).toBe('Unstyled')
  })

  it('combines a dominant-tag adjective with a completeness noun', () => {
    const twoPiece = generateFitCheck([
      makeGarment({ category: 'top', styleTags: ['minimal'] }),
      makeGarment({ category: 'pants', styleTags: ['minimal'] }),
    ])
    expect(twoPiece.vibe).toBe('Minimal layer') // 2 pieces → "layer"
  })

  it('breaks an equal tag tie alphabetically (the saved card leans on this)', () => {
    const tie = generateFitCheck([
      makeGarment({ category: 'top', styleTags: ['utility'] }),
      makeGarment({ category: 'pants', styleTags: ['minimal'] }),
    ])
    // minimal vs utility, equal count → 'minimal' wins (localeCompare).
    expect(tie.vibe).toBe('Minimal layer')
  })

  it('grows the noun as the silhouette fills out', () => {
    const four = generateFitCheck([
      makeGarment({ category: 'outerwear' }),
      makeGarment({ category: 'top' }),
      makeGarment({ category: 'pants' }),
      makeGarment({ category: 'shoes' }),
    ])
    expect(four.vibe).toMatch(/ silhouette$/)
  })
})
