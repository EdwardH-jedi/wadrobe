import { describe, expect, it } from 'vitest'
import { MANUAL_CANDIDATE_ID, mockProductMatch } from './mockProductMatch'
import type { ProductMatchInput } from './productMatchTypes'
import { FORBIDDEN_CLAIM_TERMS } from '../../test/honesty'

const input: ProductMatchInput = {
  category: 'outerwear',
  color: 'Charcoal',
  styleTags: ['tailored'],
  name: 'Wool Overcoat',
}

describe('mockProductMatch', () => {
  it('always offers a manual-entry candidate first (user stays in control)', () => {
    const out = mockProductMatch(input)
    expect(out[0].id).toBe(MANUAL_CANDIDATE_ID)
    expect(out[0].candidateType).toBe('manual')
  })

  it('returns valid candidate shapes', () => {
    for (const c of mockProductMatch(input)) {
      expect(typeof c.id).toBe('string')
      expect(c.confidence).toBeGreaterThanOrEqual(0)
      expect(c.confidence).toBeLessThanOrEqual(1)
      expect(Array.isArray(c.tags)).toBe(true)
      expect(['demo', 'manual', 'reference']).toContain(c.candidateType)
      expect(typeof c.reason).toBe('string')
    }
  })

  it('is deterministic for the same input', () => {
    expect(mockProductMatch(input)).toEqual(mockProductMatch(input))
  })

  it('never fabricates a brand and never claims a real/exact/official match', () => {
    for (const c of mockProductMatch(input)) {
      expect(c.brand).toBeUndefined()
      for (const s of [c.productName ?? '', c.reason]) {
        expect(s).not.toMatch(FORBIDDEN_CLAIM_TERMS)
      }
    }
  })
})
