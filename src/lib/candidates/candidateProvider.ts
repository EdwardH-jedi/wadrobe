// Reference-candidate provider seam (Wardrobe Flow C1).
//
// Mirrors the analyzer factory pattern (`createAnalyzer`): a candidate source is
// selected from env, defaulting to a deterministic local MOCK with zero network.
// The real text-search provider is wired in C3 behind `VITE_CANDIDATES=search`;
// until then the seam always resolves to the mock, so default behaviour is
// unchanged. The mock REUSES the existing `mockProductMatch` demo — it is never
// reimplemented here — and returns the existing `ProductMatchCandidate` shape so
// the downstream pick/prefill/approve/archive path stays byte-for-byte the same.
import type {
  ProductMatchCandidate,
  ProductMatchInput,
} from '../productMatch/productMatchTypes'
import { mockProductMatch } from '../productMatch/mockProductMatch'
import {
  createBackendClient,
  type BackendClient,
  type BackendEnv,
} from '../ai/backendClient'

export type CandidateSource = 'mock' | 'search'

export interface CandidateResult {
  /** Suggested reference candidates (may be empty → fall back to manual entry). */
  candidates: ProductMatchCandidate[]
  /** Which provider actually produced the candidates (honest provenance). */
  source: CandidateSource
}

export interface CandidateProvider {
  readonly source: CandidateSource
  generate(input: ProductMatchInput): Promise<ProductMatchCandidate[]>
}

/**
 * Env slice this seam reads: the backend base (for the search endpoint) plus the
 * candidate-source opt-in flag. Both are required for live search — mirrors the
 * analyzer factory's `VITE_API_BASE` + `VITE_ANALYZER` AND-gate.
 */
export interface CandidateEnv extends BackendEnv {
  VITE_CANDIDATES?: string
}

/**
 * Pure selection of the intended source. `search` only when explicitly opted in;
 * anything else (the default) is the mock. C3 uses this to choose the real
 * provider; today `createCandidateProvider` still returns the mock either way.
 */
export function selectCandidateSource(
  env: CandidateEnv = import.meta.env,
): CandidateSource {
  return env.VITE_CANDIDATES?.trim().toLowerCase() === 'search'
    ? 'search'
    : 'mock'
}

function createMockCandidateProvider(): CandidateProvider {
  return {
    source: 'mock',
    generate: (input) => Promise.resolve(mockProductMatch(input)),
  }
}

/**
 * Live text-search provider (C3): POST the analysis input to the server-only
 * `api/candidate-search` endpoint (eBay Browse behind a server key) and relay
 * the mapped candidates. Exported for tests. The eBay specifics + SSRF guard
 * run server-side in `ebaySearch.ts`; this only carries the request.
 */
export function createSearchCandidateProvider(
  client: BackendClient,
): CandidateProvider {
  return {
    source: 'search',
    async generate(input) {
      const res = await client.postJson<{ candidates?: ProductMatchCandidate[] }>(
        'api/candidate-search',
        input,
      )
      return Array.isArray(res.candidates) ? res.candidates : []
    },
  }
}

/**
 * Build the candidate provider for the current environment. Live search only
 * when BOTH the opt-in flag (`VITE_CANDIDATES=search`) and a backend base
 * (`VITE_API_BASE`) are set; otherwise the deterministic mock (no network).
 */
export function createCandidateProvider(
  env: CandidateEnv = import.meta.env,
): CandidateProvider {
  if (selectCandidateSource(env) === 'search') {
    const client = createBackendClient(env)
    if (client.available) return createSearchCandidateProvider(client)
  }
  return createMockCandidateProvider()
}

/**
 * Entry point the upload flow calls. A null/absent analysis input yields no
 * candidates (the manual URL fallback, always available downstream). A live
 * search FAILURE never breaks the flow — it falls back to the mock — so the
 * reference step always has something (and manual entry is always offered).
 */
export async function generateCandidates(
  input: ProductMatchInput | null,
  env: CandidateEnv = import.meta.env,
): Promise<CandidateResult> {
  const provider = createCandidateProvider(env)
  if (!input) return { candidates: [], source: provider.source }
  if (provider.source === 'mock') {
    return { candidates: await provider.generate(input), source: 'mock' }
  }
  try {
    return { candidates: await provider.generate(input), source: 'search' }
  } catch {
    return {
      candidates: await createMockCandidateProvider().generate(input),
      source: 'mock',
    }
  }
}
