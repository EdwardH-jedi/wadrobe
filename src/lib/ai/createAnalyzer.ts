// Analyzer factory (Track A). Selects the metadata analyzer from env:
//   default                                  → the local demo mock (no network)
//   VITE_API_BASE set AND VITE_ANALYZER=vision → the backend vision analyzer
//
// The two conditions are deliberately ANDed so configuring `VITE_API_BASE` for
// the Phase 3 product-meta lookup does NOT silently turn on per-upload vision —
// that needs the explicit `VITE_ANALYZER=vision` opt-in (Phase 4).
//
// The backend analyzer POSTs the downscaled thumbnail to `api/analyze` and maps
// the response with `parseVisionGuess` (source: 'vision-api'). Any failure — no
// image, network error, or unusable result — falls back to the deterministic
// mock (source stays 'mock', honest), so a configured backend never breaks the
// upload flow.
import type {
  GarmentAnalysisGuess,
  GarmentAnalysisInput,
  GarmentAnalyzer,
} from './garmentAnalysisTypes'
import { analyzeGarmentMock } from './mockGarmentAnalysis'
import { parseVisionGuess } from './visionAnalysis'
import {
  createBackendClient,
  resolveApiBase,
  type BackendClient,
  type BackendEnv,
} from './backendClient'

/** Which seam an analyzer came from. */
export type AnalyzerKind = 'mock' | 'backend'

/** Env slice this factory reads (backend base + the analyzer opt-in flag). */
export interface AnalyzerEnv extends BackendEnv {
  VITE_ANALYZER?: string
}

/**
 * A resolved analyzer, tagged with its seam for diagnostics + tests. The UI only
 * depends on `analyze`; `kind`/`backend` are inspection aids.
 */
export interface ResolvedAnalyzer extends GarmentAnalyzer {
  readonly kind: AnalyzerKind
  /** The configured client when this analyzer talks to a backend. */
  readonly backend?: BackendClient
}

/** Pure selection: which analyzer should run for this env (mock by default). */
export function selectAnalyzerKind(
  env: AnalyzerEnv = import.meta.env,
): AnalyzerKind {
  const visionOptIn = env.VITE_ANALYZER?.trim().toLowerCase() === 'vision'
  return resolveApiBase(env) && visionOptIn ? 'backend' : 'mock'
}

function createMockAnalyzer(): ResolvedAnalyzer {
  return {
    kind: 'mock',
    analyze(input: GarmentAnalysisInput): Promise<GarmentAnalysisGuess> {
      return Promise.resolve(analyzeGarmentMock(input))
    },
  }
}

/**
 * Backend vision analyzer (Phase 4). POSTs the thumbnail to `api/analyze` and
 * normalizes the response. Falls back to the mock — keeping `source: 'mock'` —
 * when there is no image, the request fails, or the result is unusable, so a
 * configured-but-failing backend never blocks an upload. Exported for tests.
 */
export function createBackendAnalyzer(client: BackendClient): ResolvedAnalyzer {
  return {
    kind: 'backend',
    backend: client,
    async analyze(input: GarmentAnalysisInput): Promise<GarmentAnalysisGuess> {
      if (!input.imageDataUrl) return analyzeGarmentMock(input)
      try {
        const raw = await client.postJson<unknown>('api/analyze', {
          imageDataUrl: input.imageDataUrl,
          fileName: input.fileName,
          dominantColorHex: input.dominantColorHex,
        })
        return parseVisionGuess(raw, input.dominantColorHex) ?? analyzeGarmentMock(input)
      } catch {
        return analyzeGarmentMock(input)
      }
    },
  }
}

/** Build the analyzer for the current environment (mock by default). */
export function createAnalyzer(
  env: AnalyzerEnv = import.meta.env,
): ResolvedAnalyzer {
  if (selectAnalyzerKind(env) === 'backend') {
    return createBackendAnalyzer(createBackendClient(env))
  }
  return createMockAnalyzer()
}
