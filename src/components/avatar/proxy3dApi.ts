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
    let detail = `The backend rejected the request (HTTP ${response.status}).`
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
      // Non-JSON error body — keep the generic message.
    }
    throw new Proxy3dApiError(detail, response.status)
  }

  return (await response.json()) as Proxy3dRecord
}
