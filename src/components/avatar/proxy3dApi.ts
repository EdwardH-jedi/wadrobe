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

export interface CreateProxy3dOptions {
  /** Optional back-side PNG for a dual-sided proxy (B3.7). */
  back?: Blob
  backName?: string
  /** Manual back alignment (B3.8) — normalized; the backend clamps. */
  backScale?: number
  backOffsetX?: number
  backOffsetY?: number
  fetchFn?: FetchLike
}

/**
 * POST the front PNG (and optionally a back PNG) and return the generated
 * proxy-3D record.
 *
 * @throws Proxy3dApiError with the backend's `detail` message on HTTP errors,
 *   or a reachability message (status null) when the request itself fails.
 */

// --- Runtime validation -----------------------------------------------------

/**
 * The backend is a separate process on a different runtime; its response is
 * untrusted input like any other. `as Proxy3dRecord` asserted a shape TypeScript
 * never checked, so a version skew or an error page served with a 200 surfaced
 * as `undefined is not an object` deep in the viewer, far from the cause.
 *
 * This is a hand-written guard rather than a schema library: one shape, checked
 * once, is not worth a dependency. It validates what the UI actually reads.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const METHODS = new Set([
  'extruded-alpha-contour',
  'extruded-alpha-contour-dual',
  'textured-plane',
])

function isInputInfo(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.has_alpha === 'boolean'
  )
}

export function parseProxy3dRecord(value: unknown): Proxy3dRecord | null {
  if (!isRecord(value)) return null
  if (typeof value.job_id !== 'string' || value.job_id.length === 0) return null
  if (value.status !== 'done') return null
  if (typeof value.method !== 'string' || !METHODS.has(value.method)) return null
  if (typeof value.alpha_mask_used !== 'boolean') return null
  if (!isInputInfo(value.input)) return null
  if (!isRecord(value.mesh)) return null
  if (
    typeof value.mesh.vertices !== 'number' ||
    typeof value.mesh.faces !== 'number'
  ) {
    return null
  }
  if (typeof value.result_url !== 'string') return null
  // `limitations` is shown verbatim to the user; a missing one would silently
  // drop the honesty copy, so it is required rather than defaulted.
  if (typeof value.limitations !== 'string') return null
  if (typeof value.created_at !== 'number') return null
  return value as unknown as Proxy3dRecord
}


/** Read a JSON body, turning a non-JSON response into an honest error. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new Proxy3dApiError(
      'The backend returned a response that was not JSON.',
      response.status,
    )
  }
}

/** Validate a record or fail with a message that names the real problem. */
function parseOrThrow(body: unknown): Proxy3dRecord {
  const record = parseProxy3dRecord(body)
  if (!record) {
    throw new Proxy3dApiError(
      'The backend returned a proxy-3D record this app does not understand — ' +
        'it may be running a different version.',
      null,
    )
  }
  return record
}

export async function createProxy3d(
  file: Blob,
  fileName: string,
  options: CreateProxy3dOptions = {},
): Promise<Proxy3dRecord> {
  // Call the global lazily and unextracted (extracted `fetch` loses its
  // window binding in strict-mode modules).
  const doFetch: FetchLike =
    options.fetchFn ?? ((input, init) => fetch(input, init))

  const form = new FormData()
  form.append('file', file, fileName)
  if (options.back) {
    form.append('back_file', options.back, options.backName ?? 'back.png')
    if (options.backScale !== undefined) {
      form.append('back_scale', String(options.backScale))
    }
    if (options.backOffsetX !== undefined) {
      form.append('back_offset_x', String(options.backOffsetX))
    }
    if (options.backOffsetY !== undefined) {
      form.append('back_offset_y', String(options.backOffsetY))
    }
  }

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

  return parseOrThrow(await readJson(response))
}

/**
 * Fetch the persisted record for an existing job (used to reopen a saved
 * preview). Throws Proxy3dApiError: status 404 when the job is gone, null
 * when the backend is unreachable.
 */
export async function getProxy3d(
  jobId: string,
  fetchFn?: FetchLike,
): Promise<Proxy3dRecord> {
  const doFetch: FetchLike = fetchFn ?? ((input, init) => fetch(input, init))
  let response: Response
  try {
    response = await doFetch(`${PROXY3D_ENDPOINT}/${jobId}`)
  } catch {
    throw new Proxy3dApiError(
      'Could not reach the local proxy-3D backend.',
      null,
    )
  }
  if (!response.ok) {
    throw new Proxy3dApiError(
      response.status === 404
        ? 'This preview no longer exists in the local backend storage.'
        : `The backend could not return the preview (HTTP ${response.status}).`,
      response.status,
    )
  }
  return parseOrThrow(await readJson(response))
}
