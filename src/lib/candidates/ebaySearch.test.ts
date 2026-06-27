import { describe, expect, it } from 'vitest'
import {
  buildEbaySearchQuery,
  mapEbayItemsToCandidates,
} from './ebaySearch'
import type { ProductMatchInput } from '../productMatch/productMatchTypes'

const INPUT: ProductMatchInput = {
  category: 'outerwear',
  color: 'Charcoal',
  styleTags: ['tailored', 'charcoal'], // dup with color to prove de-dup
  brand: 'Acme',
}

describe('buildEbaySearchQuery', () => {
  it('joins brand/color/tags/category, de-duplicated and trimmed', () => {
    const q = buildEbaySearchQuery(INPUT)
    expect(q).toBe('Acme Charcoal tailored outerwear')
  })

  it('handles a sparse input without throwing', () => {
    expect(buildEbaySearchQuery({ category: 'shoes' })).toBe('shoes')
  })
})

describe('mapEbayItemsToCandidates', () => {
  const payload = {
    itemSummaries: [
      {
        title: 'Charcoal Wool Overcoat',
        itemWebUrl: 'https://www.ebay.com/itm/123',
        image: { imageUrl: 'https://i.ebayimg.com/x.jpg' },
        brand: 'Acme',
      },
      // dropped: no title
      { itemWebUrl: 'https://www.ebay.com/itm/456' },
      // dropped: SSRF-unsafe / non-public host
      { title: 'Sketchy', itemWebUrl: 'http://localhost/itm/789' },
      // dropped: non-http(s)
      { title: 'Bad scheme', itemWebUrl: 'ftp://ebay.com/x' },
    ],
  }

  it('maps valid items to ProductMatchCandidate and drops unsafe/incomplete ones', () => {
    const out = mapEbayItemsToCandidates(payload, INPUT)
    expect(out).toHaveLength(1)
    const c = out[0]
    expect(c.candidateType).toBe('reference')
    expect(c.productName).toBe('Charcoal Wool Overcoat')
    expect(c.brand).toBe('Acme')
    expect(c.sourceUrl).toBe('https://www.ebay.com/itm/123')
    expect(c.imageUrl).toBe('https://i.ebayimg.com/x.jpg')
    expect(c.confidence).toBeGreaterThan(0)
    expect(c.reason).toMatch(/not a verified match/i)
  })

  it('returns [] for a malformed or empty payload', () => {
    expect(mapEbayItemsToCandidates(null, INPUT)).toEqual([])
    expect(mapEbayItemsToCandidates({}, INPUT)).toEqual([])
    expect(mapEbayItemsToCandidates({ itemSummaries: 'nope' }, INPUT)).toEqual([])
  })
})
