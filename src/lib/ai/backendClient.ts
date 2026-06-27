// Optional backend HTTP client (Track A, Phase 2A — Vercel serverless).
//
// SKELETON ONLY. This phase wires the *seam*: it resolves whether a backend is
// configured (via `VITE_API_BASE`) and exposes a typed JSON transport for later
// use. No concrete endpoint is called yet — the real routes attach in Phase 3
// (`/api/product-meta`) and Phase 4 (vision analysis). By default `VITE_API_BASE`
// is unset, so `available` is false and the app stays mock-only (no network).
//
// Honest scope: configuring a base URL does NOT enable any recognition today;
// the analyzer's backend path remains a stub until Phase 4 (see createAnalyzer).

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
