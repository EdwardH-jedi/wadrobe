// The cutout provider chain (revival Phase 2).
//
// `garmentCutout.ts` already has a seam for swapping HOW a cutout is computed
// (`CutoutDeps` injects the rasterize/encode steps). What it has no way to
// express is an ordered list of WHO tries: the shape a quality upgrade actually
// needs is
//
//     higher-quality segmentation  →  (unavailable/failed)
//     local flood fill             →  (unavailable/failed)
//     the original image, unchanged
//
// This module is that list, and nothing more. It adds no capability today: the
// default chain holds exactly one provider — the existing local flood fill —
// so behaviour is unchanged by construction. It exists so that adding a better
// segmenter later is a one-line registration rather than a rewrite of the
// upload flow, and so the fallback order is written down in one place instead
// of living in someone's head.
//
// Deliberately NOT here: any actual segmentation model. Weighing a large ML
// dependency against the quality gain is a later phase's question; introducing
// the seam now is what keeps that question cheap to answer.
import {
  attemptGarmentCutout,
  defaultCutoutDeps,
  type CutoutOptions,
  type CutoutResult,
} from './garmentCutout'

/**
 * One way of producing a cutout.
 *
 * `isAvailable` lets a provider decline before doing any work — a model that
 * has not been downloaded, a browser without the API it needs — so the chain
 * can skip it without paying for a decode first.
 */
export interface CutoutProvider {
  /** Stable identifier, used in results and diagnostics. */
  id: string
  /** Cheap, synchronous readiness check. Absent means "always ready". */
  isAvailable?: () => boolean
  run: (imageUrl: string, options?: CutoutOptions) => Promise<CutoutResult>
}

/** The on-device edge-seeded flood fill. Always available; always last. */
export const localFloodFillProvider: CutoutProvider = {
  id: 'local-flood-fill',
  run: (imageUrl, options) =>
    attemptGarmentCutout(imageUrl, defaultCutoutDeps, options),
}

/**
 * The chain, in the order it is tried. One entry today — the local flood fill —
 * which is why default behaviour is identical to calling it directly.
 */
export const DEFAULT_CUTOUT_PROVIDERS: CutoutProvider[] = [
  localFloodFillProvider,
]

/** A cutout result, plus which provider actually produced it. */
export type ProvidedCutoutResult = CutoutResult & { providerId?: string }

/**
 * Run the chain and return the first SUCCESS.
 *
 * "Success" is the only thing worth falling forward from: `unavailable` (this
 * provider cannot help with this photo) and `failed` (it tried and could not
 * isolate a subject) both mean the next provider deserves a turn. If every
 * provider declines, the LAST non-success result is returned — the most
 * specific honest explanation available, rather than a generic one invented
 * here.
 *
 * A provider that throws is treated as a provider that declined. A future
 * segmenter is exactly the kind of code that can throw in ways this module
 * cannot anticipate, and one misbehaving provider must never take down a chain
 * whose whole purpose is to degrade gracefully.
 */
export async function runCutoutProviders(
  imageUrl: string,
  providers: CutoutProvider[] = DEFAULT_CUTOUT_PROVIDERS,
  options?: CutoutOptions,
): Promise<ProvidedCutoutResult> {
  let last: ProvidedCutoutResult = {
    status: 'unavailable',
    reason: 'No background-removal provider was available.',
  }

  for (const provider of providers) {
    if (provider.isAvailable && !provider.isAvailable()) continue
    let result: CutoutResult
    try {
      result = await provider.run(imageUrl, options)
    } catch {
      continue
    }
    if (result.status === 'success') {
      return { ...result, providerId: provider.id }
    }
    last = { ...result, providerId: provider.id }
  }

  return last
}
