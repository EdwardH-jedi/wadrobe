// Phase 1: analysis-provenance derivation (confidence/source/userEdited).
import { describe, expect, it } from 'vitest'
import {
  deriveAnalysisProvenance,
  didUserEditGuess,
} from './garmentAnalysisTypes'
import type { GarmentAnalysisGuess } from './garmentAnalysisTypes'

const GUESS: GarmentAnalysisGuess = {
  category: 'top',
  color: 'Charcoal',
  colorHex: '#2b2b30',
  styleTags: ['minimal', 'relaxed'],
  confidence: 0.82,
  source: 'mock',
}

/** A draft slice matching the guess exactly (no user edits). */
const matchingDraft = {
  category: GUESS.category,
  color: GUESS.color,
  colorHex: GUESS.colorHex,
  styleTags: [...GUESS.styleTags],
  brand: undefined,
}

describe('didUserEditGuess', () => {
  it('is false when the draft matches the guess (order-insensitive tags)', () => {
    expect(didUserEditGuess(matchingDraft, GUESS)).toBe(false)
    expect(
      didUserEditGuess({ ...matchingDraft, styleTags: ['relaxed', 'minimal'] }, GUESS),
    ).toBe(false)
  })

  it('is true when category, color, colorHex, or tags differ', () => {
    expect(didUserEditGuess({ ...matchingDraft, category: 'pants' }, GUESS)).toBe(true)
    expect(didUserEditGuess({ ...matchingDraft, color: 'Navy' }, GUESS)).toBe(true)
    expect(didUserEditGuess({ ...matchingDraft, colorHex: '#000' }, GUESS)).toBe(true)
    expect(
      didUserEditGuess({ ...matchingDraft, styleTags: ['minimal'] }, GUESS),
    ).toBe(true)
  })

  it('treats a user-added brand as an edit (guess carries none)', () => {
    expect(didUserEditGuess({ ...matchingDraft, brand: 'Maison Grey' }, GUESS)).toBe(
      true,
    )
  })
})

describe('deriveAnalysisProvenance', () => {
  it('carries the guess confidence/source and a clean userEdited=false', () => {
    expect(deriveAnalysisProvenance(matchingDraft, GUESS)).toEqual({
      analysisConfidence: 0.82,
      analysisSource: 'mock',
      userEdited: false,
    })
  })

  it('flags userEdited when the draft diverges from the guess', () => {
    const out = deriveAnalysisProvenance({ ...matchingDraft, color: 'Navy' }, GUESS)
    expect(out.userEdited).toBe(true)
    expect(out.analysisSource).toBe('mock')
  })

  it('returns an empty record for a hand-built garment (no guess)', () => {
    expect(deriveAnalysisProvenance(matchingDraft, null)).toEqual({})
  })
})
