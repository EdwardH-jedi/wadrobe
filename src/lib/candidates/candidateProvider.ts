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

/** Env slice this seam reads (the opt-in flag for the real search provider). */
export interface CandidateEnv {
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
 * Build the candidate provider for the current environment. Always the mock
 * today (the live search provider lands in C3); kept as a factory so that swap
 * is a one-line change here and the flow never has to know which source ran.
 */
export function createCandidateProvider(
  env: CandidateEnv = import.meta.env,
): CandidateProvider {
  if (selectCandidateSource(env) === 'search') {
    // C3: return the live text-search provider here. It is not built yet, so the
    // seam falls back to the mock — never a no-op and never a network call.
    return createMockCandidateProvider()
  }
  return createMockCandidateProvider()
}

/**
 * Entry point the upload flow calls. A null/absent analysis input yields no
 * candidates (an honest "nothing to suggest" → the manual URL fallback, always
 * available downstream). The reported `source` is the provider that actually
 * ran, never the merely-requested one.
 */
export async function generateCandidates(
  input: ProductMatchInput | null,
  env: CandidateEnv = import.meta.env,
): Promise<CandidateResult> {
  const provider = createCandidateProvider(env)
  if (!input) return { candidates: [], source: provider.source }
  return { candidates: await provider.generate(input), source: provider.source }
}
