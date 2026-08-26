// Optional backend HTTP client for the serverless routes in `api/` (Track A).
//
// It resolves whether a backend is configured (via `VITE_API_BASE`) and exposes
// one typed JSON transport shared by every optional integration:
// `api/product-meta` (product-page metadata), `api/analyze` (vision metadata
// draft), and `api/candidate-search` (reference-candidate lookup). By default
// `VITE_API_BASE` is unset, so `available` is false and the app stays local-only
// and makes no network calls.
//
// Honest scope: configuring a base URL alone enables only the URL-driven
// lookups. Sending an uploaded photo for vision analysis needs the separate,
// explicit `VITE_ANALYZER=vision` opt-in as well (see `createAnalyzer`).

/** The slice of env this module reads (kept minimal for easy test injection). */
export interface BackendEnv {
  VITE_API_BASE?: string
}

export interface BackendClient {
  /** True only when a non-empty `VITE_API_BASE` is configured. */
  readonly available: boolean
  /** Normalized base URL (no trailing slash), or null when unconfigured. */
  readonly apiBase: string | null
  /**
   * Typed JSON POST against `${apiBase}/${path}`. Throws when the backend is not
   * configured. This is the shared transport skeleton; concrete callers land in
   * Phase 3/4.
   */
  postJson<T>(path: string, body: unknown): Promise<T>
}

/** Resolve and normalize the configured API base, or null when unset/blank. */
export function resolveApiBase(env: BackendEnv = import.meta.env): string | null {
  const raw = typeof env.VITE_API_BASE === 'string' ? env.VITE_API_BASE.trim() : ''
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

/** Build a backend client for the given env (defaults to the build-time env). */
export function createBackendClient(
  env: BackendEnv = import.meta.env,
): BackendClient {
  const apiBase = resolveApiBase(env)
  return {
    available: apiBase !== null,
    apiBase,
    async postJson<T>(path: string, body: unknown): Promise<T> {
      if (!apiBase) {
        throw new Error('Backend is not configured (VITE_API_BASE is unset).')
      }
      const url = `${apiBase}/${path.replace(/^\/+/, '')}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error(`Backend request failed (${res.status}) for ${path}`)
      }
      return (await res.json()) as T
    },
  }
}
