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
  it('always resolves to the mock today (search lands in C3 — no network)', () => {
    expect(createCandidateProvider({}).source).toBe('mock')
    // Even with the flag set, the live provider is not built yet, so the seam
    // stays on the mock rather than silently doing nothing or hitting the network.
    expect(createCandidateProvider({ VITE_CANDIDATES: 'search' }).source).toBe(
      'mock',
    )
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
