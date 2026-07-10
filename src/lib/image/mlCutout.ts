// Optional, env-gated ML background removal (Avatar Visual step 1b).
//
// Gate: the ML remover is used ONLY when `VITE_CUTOUT=ml` is set. That single
// opt-in flag is the network gate — with it UNSET this module makes ZERO network
// calls (returns `unavailable` immediately), so the default build stays local-only
// and the caller falls back to the on-device heuristic, then the original photo.
// The request goes to the SAME-ORIGIN `/api/cutout` (in dev the Vite server
// proxies `/api` to the local backend — no CORS), matching `proxy3dApi.ts`.
// `VITE_API_BASE` is NOT required; it is only an optional absolute override for a
// split/self-hosted backend (which must configure its own CORS).
//
// Honesty: this is a background REMOVER (rembg/U2Net on the local backend), NOT
// recognition, sizing, try-on, or 3D. It POSTs the image to `/api/cutout` and
// gets a transparent PNG back; any failure degrades gracefully.
import { resolveApiBase, type BackendEnv } from '../ai/backendClient'
import { dataUrlToBlob } from '../storage/garmentAssetStorage'
import type { CutoutResult } from './garmentCutout'

/** Env slice this module reads: the backend base + the ML cutout opt-in flag. */
export interface MlCutoutEnv extends BackendEnv {
  VITE_CUTOUT?: string
}

/** Honest, user-safe reason strings for the ML path. */
export const ML_CUTOUT_REASONS = {
  disabled: 'ML background removal is off (set VITE_CUTOUT=ml to enable it).',
  badImage: 'This image could not be prepared for background removal.',
  requestFailed: 'The background-removal service could not be reached.',
} as const

export const ML_CUTOUT_WARNING =
  'Server background removal — quality varies with the photo.'

/** Same-origin cutout path. In dev the Vite server proxies `/api` to the local
 *  FastAPI backend (vite.config.ts), so the request stays same-origin and needs
 *  no CORS — matching `proxy3dApi.ts`. */
export const ML_CUTOUT_ENDPOINT = '/api/cutout'

/**
 * Pure gate: is the ML remover enabled? Gated on the explicit `VITE_CUTOUT=ml`
 * opt-in ALONE — this is what keeps the default build network-free. It does NOT
 * require `VITE_API_BASE`: the cutout endpoint is reached same-origin via the
 * dev proxy (or a co-hosted deploy), so requiring an absolute base was the bug
 * that forced a cross-origin request the backend has no CORS for.
 */
export function mlCutoutEnabled(env: MlCutoutEnv = import.meta.env): boolean {
  return env.VITE_CUTOUT?.trim().toLowerCase() === 'ml'
}

/** The cutout URL: same-origin by default; an absolute `VITE_API_BASE` is an
 *  OPTIONAL override for a split/self-hosted backend (which must set its own
 *  CORS). Matches the project's relative-`/api` convention when unset. */
export function mlCutoutUrl(env: MlCutoutEnv = import.meta.env): string {
  const base = resolveApiBase(env)
  return base ? `${base}${ML_CUTOUT_ENDPOINT}` : ML_CUTOUT_ENDPOINT
}

/** Injectable seam so the network + blob decode are unit-testable. */
export interface MlCutoutDeps {
  fetch: typeof fetch
  blobToDataUrl: (blob: Blob) => Promise<string>
}

const defaultDeps: MlCutoutDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  blobToDataUrl: (blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('read failed'))
      reader.readAsDataURL(blob)
    }),
}

/**
 * Attempt an ML cutout. Resolves a typed `CutoutResult` and NEVER throws into the
 * caller. Returns `unavailable` WITHOUT any network call when the env gate is off
 * (this is what keeps the default build network-free). On a configured build it
 * POSTs the image and returns the transparent PNG as a data URL on success.
 */
export async function attemptMlCutout(
  imageUrl: string,
  env: MlCutoutEnv = import.meta.env,
  deps: MlCutoutDeps = defaultDeps,
): Promise<CutoutResult> {
  if (!mlCutoutEnabled(env)) {
    return { status: 'unavailable', reason: ML_CUTOUT_REASONS.disabled }
  }
  // Resolve the source to a Blob. Archived garments render via
  // `getGarmentDisplayImage`, which is a `data:` URL OR a LOCAL IndexedDB object
  // URL (`blob:`) for hydrated cropped/cutout assets — accept both. We resolve a
  // `blob:` URL through the (local, no-egress) fetch. A REMOTE image (e.g. an
  // http product-reference URL) is deliberately NOT fetched here: that would risk
  // a cross-origin/CORS request and a third-party leak, so it degrades to the
  // caller's local heuristic instead.
  let blob = dataUrlToBlob(imageUrl)
  if (!blob && imageUrl.startsWith('blob:')) {
    try {
      const src = await deps.fetch(imageUrl)
      blob = src.ok ? await src.blob() : null
    } catch {
      blob = null
    }
  }
  if (!blob) {
    return { status: 'failed', reason: ML_CUTOUT_REASONS.badImage }
  }
  try {
    const form = new FormData()
    form.append('file', blob, 'garment.png')
    const res = await deps.fetch(mlCutoutUrl(env), {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      return { status: 'failed', reason: ML_CUTOUT_REASONS.requestFailed }
    }
    const outBlob = await res.blob()
    const cutoutImageUrl = await deps.blobToDataUrl(outBlob)
    return {
      status: 'success',
      cutoutImageUrl,
      source: 'ml-backend',
      warnings: [ML_CUTOUT_WARNING],
    }
  } catch {
    return { status: 'failed', reason: ML_CUTOUT_REASONS.requestFailed }
  }
}
