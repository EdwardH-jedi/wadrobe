// Thin client for the Track B backend's /api/proxy-3d endpoint. In dev the
// Vite server proxies /api to the local FastAPI backend (vite.config.ts), so
// requests stay same-origin and no CORS setup is needed.
import type { Proxy3dRecord } from './proxy3dFlow'

export const PROXY3D_ENDPOINT = '/api/proxy-3d'

export class Proxy3dApiError extends Error {
  /** HTTP status, or null when the backend was unreachable. */
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'Proxy3dApiError'
    this.status = status
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * POST the PNG and return the generated proxy-3D record.
 *
 * @throws Proxy3dApiError with the backend's `detail` message on HTTP errors,
 *   or a reachability message (status null) when the request itself fails.
 */
export async function createProxy3d(
  file: Blob,
  fileName: string,
  fetchFn?: FetchLike,
): Promise<Proxy3dRecord> {
  // Call the global lazily and unextracted (extracted `fetch` loses its
  // window binding in strict-mode modules).
  const doFetch: FetchLike = fetchFn ?? ((input, init) => fetch(input, init))

  const form = new FormData()
  form.append('file', file, fileName)

  let response: Response
  try {
    response = await doFetch(PROXY3D_ENDPOINT, { method: 'POST', body: form })
  } catch {
    throw new Proxy3dApiError(
      'Could not reach the local proxy-3D backend.',
      null,
    )
  }

  if (!response.ok) {
    let detail: string | null = null
    try {
      const body: unknown = await response.json()
      if (
        typeof body === 'object' &&
        body !== null &&
        typeof (body as { detail?: unknown }).detail === 'string'
      ) {
        detail = (body as { detail: string }).detail
      }
    } catch {
      // Non-JSON error body.
    }
    if (detail === null && response.status >= 500) {
      // A 5xx without the backend's JSON `detail` shape is almost always the
      // dev proxy reporting that the backend is down (the Vite proxy turns a
      // refused connection into a bare 500) — say that honestly instead of
      // claiming the backend "rejected" a request it never saw.
      throw new Proxy3dApiError(
        `The local proxy-3D backend did not answer (HTTP ${response.status}) — it may not be running.`,
        response.status,
      )
    }
    throw new Proxy3dApiError(
      detail ?? `The backend rejected the request (HTTP ${response.status}).`,
      response.status,
    )
  }

  return (await response.json()) as Proxy3dRecord
}
