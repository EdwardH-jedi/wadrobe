import { describe, expect, it } from 'vitest'
import {
  createCandidateProvider,
  generateCandidates,
  selectCandidateSource,
} from './candidateProvider'
import type { ProductMatchInput } from '../productMatch/productMatchTypes'

const INPUT: ProductMatchInput = {
  category: 'outerwear',
  color: 'Charcoal',
  styleTags: ['tailored'],
  name: 'Wool Coat',
}

describe('selectCandidateSource', () => {
  it('is mock by default and only search when explicitly opted in', () => {
    expect(selectCandidateSource({})).toBe('mock')
    expect(selectCandidateSource({ VITE_CANDIDATES: 'search' })).toBe('search')
    expect(selectCandidateSource({ VITE_CANDIDATES: 'nope' })).toBe('mock')
  })
})

describe('createCandidateProvider', () => {
  it('is the mock unless BOTH the flag and a backend base are set', () => {
    expect(createCandidateProvider({}).source).toBe('mock')
    // Flag alone (no VITE_API_BASE) → still mock, never a network call.
    expect(createCandidateProvider({ VITE_CANDIDATES: 'search' }).source).toBe(
      'mock',
    )
    // Backend base alone (no opt-in) → mock.
    expect(
      createCandidateProvider({ VITE_API_BASE: 'https://meta.test' }).source,
    ).toBe('mock')
    // Both → the live search provider (its .source; no generate call here).
    expect(
      createCandidateProvider({
        VITE_CANDIDATES: 'search',
        VITE_API_BASE: 'https://meta.test',
      }).source,
    ).toBe('search')
  })
})

describe('generateCandidates', () => {
  it('returns deterministic mock candidates for an analysis input', async () => {
    const a = await generateCandidates(INPUT, {})
    const b = await generateCandidates(INPUT, {})
    expect(a.source).toBe('mock')
    expect(a.candidates.length).toBeGreaterThan(0)
    expect(a.candidates).toEqual(b.candidates) // deterministic
  })

  it('reuses the existing mockProductMatch shape (manual fallback present)', async () => {
    const { candidates } = await generateCandidates(INPUT, {})
    expect(candidates.some((c) => c.candidateType === 'manual')).toBe(true)
    for (const c of candidates) {
      expect(typeof c.confidence).toBe('number')
      expect(['demo', 'manual', 'reference']).toContain(c.candidateType)
    }
  })

  it('yields no candidates for an empty analysis (fallback-to-manual signal)', async () => {
    const result = await generateCandidates(null, {})
    expect(result.candidates).toEqual([])
    expect(result.source).toBe('mock')
  })
})
