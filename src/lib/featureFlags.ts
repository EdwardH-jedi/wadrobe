// Build-time feature flags.
//
// The wardrobe archive (Track A) is the product; the Proxy 3D Lab (Track B) is
// a research track that depends on a locally-running FastAPI backend and pulls
// three.js in on demand. Shipping its navigation entry by default would offer a
// visitor a door into a view that cannot work without that backend, so the lab
// is opt-in: unset means off.
//
// This follows the same shape as the other env seams in this codebase
// (`resolveApiBase`, `selectAnalyzerKind`) — a pure function over an injected
// env slice, so it is testable without stubbing the global import.meta.

/** The slice of env this module reads (kept minimal for easy test injection). */
export interface FeatureFlagEnv {
  VITE_ENABLE_EXPERIMENTAL_3D?: string
}

const TRUTHY = new Set(['1', 'true', 'on', 'yes'])

/**
 * Is the experimental Proxy 3D Lab (Track B) enabled for this build?
 *
 * Default (unset, blank, or any non-truthy value) is `false`: the lab's
 * navigation entry and the closet's 3D affordances are hidden and three.js is
 * never loaded. Enabling it changes only what is *reachable* — persisted
 * `proxy3dPreview` metadata on archived pieces is never read, written, or
 * cleared by this flag, so toggling it in either direction is lossless.
 */
export function isExperimental3dEnabled(
  env: FeatureFlagEnv = import.meta.env,
): boolean {
  const raw = env.VITE_ENABLE_EXPERIMENTAL_3D
  return typeof raw === 'string' && TRUTHY.has(raw.trim().toLowerCase())
}
