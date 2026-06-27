import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// Control the backend client the seam builds internally, so the live-search
// relay and its mock-fallback can be tested without any real network.
vi.mock('../ai/backendClient', async (orig) => {
  const actual = await orig<typeof import('../ai/backendClient')>()
  return { ...actual, createBackendClient: vi.fn() }
})

import { createBackendClient, type BackendClient } from '../ai/backendClient'
import {
  createSearchCandidateProvider,
  generateCandidates,
} from './candidateProvider'
import type {
  ProductMatchCandidate,
  ProductMatchInput,
} from '../productMatch/productMatchTypes'

const mockedCreateBackendClient = createBackendClient as unknown as Mock

const INPUT: ProductMatchInput = { category: 'outerwear', color: 'Charcoal' }
const SEARCH_ENV = {
  VITE_CANDIDATES: 'search',
  VITE_API_BASE: 'https://meta.test',
}
const HIT: ProductMatchCandidate = {
  id: 'search-ebay-0',
  productName: 'Charcoal Wool Overcoat',
  sourceUrl: 'https://www.ebay.com/itm/123',
  confidence: 0.5,
  reason: 'Shopping search result — confirm or edit (not a verified match).',
  tags: ['outerwear'],
  candidateType: 'reference',
}

function fakeClient(postJson: BackendClient['postJson']): BackendClient {
  return { available: true, postJson } as unknown as BackendClient
}

beforeEach(() => {
  mockedCreateBackendClient.mockReset()
})

describe('createSearchCandidateProvider', () => {
  it('POSTs the input and relays the mapped candidates', async () => {
    const postJson = vi.fn(async () => ({ candidates: [HIT] }))
    const out = await createSearchCandidateProvider(
      fakeClient(postJson as unknown as BackendClient['postJson']),
    ).generate(INPUT)
    expect(postJson).toHaveBeenCalledWith('api/candidate-search', INPUT)
    expect(out).toEqual([HIT])
  })

  it('returns [] when the endpoint yields no candidates array', async () => {
    const out = await createSearchCandidateProvider(
      fakeClient((async () => ({})) as unknown as BackendClient['postJson']),
    ).generate(INPUT)
    expect(out).toEqual([])
  })
})

describe('generateCandidates with live search', () => {
  it('uses search candidates when the endpoint succeeds', async () => {
    mockedCreateBackendClient.mockReturnValue(
      fakeClient((async () => ({ candidates: [HIT] })) as unknown as BackendClient['postJson']),
    )
    const result = await generateCandidates(INPUT, SEARCH_ENV)
    expect(result.source).toBe('search')
    expect(result.candidates).toEqual([HIT])
  })

  it('falls back to mock candidates when search fails (flow never breaks)', async () => {
    mockedCreateBackendClient.mockReturnValue(
      fakeClient((async () => {
        throw new Error('search down')
      }) as unknown as BackendClient['postJson']),
    )
    const result = await generateCandidates(INPUT, SEARCH_ENV)
    expect(result.source).toBe('mock')
    expect(result.candidates.length).toBeGreaterThan(0)
  })
})
