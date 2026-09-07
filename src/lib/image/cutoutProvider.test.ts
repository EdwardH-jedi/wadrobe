// The provider chain adds no capability today; what it must prove is that the
// fallback ORDER is right and that a badly-behaved provider cannot break it.
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CUTOUT_PROVIDERS,
  localFloodFillProvider,
  runCutoutProviders,
  type CutoutProvider,
} from './cutoutProvider'
import type { CutoutResult } from './garmentCutout'

const SUCCESS: CutoutResult = {
  status: 'success',
  cutoutImageUrl: 'data:CUT',
  source: 'local-flood-fill',
}
const UNAVAILABLE: CutoutResult = { status: 'unavailable', reason: 'busy bg' }
const FAILED: CutoutResult = { status: 'failed', reason: 'no subject' }

function provider(
  id: string,
  result: CutoutResult | (() => never),
  isAvailable?: () => boolean,
): CutoutProvider {
  return {
    id,
    isAvailable,
    run: async () => {
      if (typeof result === 'function') return result()
      return result
    },
  }
}

describe('runCutoutProviders — first success wins', () => {
  it('returns the first provider that succeeds and names it', async () => {
    const result = await runCutoutProviders('img', [
      provider('better', SUCCESS),
      provider('local', FAILED),
    ])

    expect(result.status).toBe('success')
    expect(result.providerId).toBe('better')
  })

  it('does not run later providers once one has succeeded', async () => {
    const later = vi.fn(async () => SUCCESS)
    await runCutoutProviders('img', [
      provider('first', SUCCESS),
      { id: 'later', run: later },
    ])

    expect(later).not.toHaveBeenCalled()
  })

  it('falls through unavailable to the next provider', async () => {
    const result = await runCutoutProviders('img', [
      provider('better', UNAVAILABLE),
      provider('local', SUCCESS),
    ])

    expect(result.status).toBe('success')
    expect(result.providerId).toBe('local')
  })

  it('falls through failed as well as unavailable', async () => {
    // A provider that tried and could not isolate a subject has not settled the
    // question for a different provider.
    const result = await runCutoutProviders('img', [
      provider('better', FAILED),
      provider('local', SUCCESS),
    ])

    expect(result.status).toBe('success')
    expect(result.providerId).toBe('local')
  })

  it('skips a provider that declines before doing any work', async () => {
    const run = vi.fn(async () => SUCCESS)
    const result = await runCutoutProviders('img', [
      { id: 'unready', isAvailable: () => false, run },
      provider('local', SUCCESS),
    ])

    // No decode paid for a model that is not loaded.
    expect(run).not.toHaveBeenCalled()
    expect(result.providerId).toBe('local')
  })

  it('treats a throwing provider as one that declined', async () => {
    // A future segmenter can fail in ways this module cannot anticipate, and
    // one misbehaving provider must never take down the whole chain.
    const result = await runCutoutProviders('img', [
      provider('explodes', () => {
        throw new Error('wasm blew up')
      }),
      provider('local', SUCCESS),
    ])

    expect(result.status).toBe('success')
    expect(result.providerId).toBe('local')
  })
})

describe('runCutoutProviders — when nothing succeeds', () => {
  it('returns the last honest explanation rather than inventing one', async () => {
    const result = await runCutoutProviders('img', [
      provider('better', UNAVAILABLE),
      provider('local', FAILED),
    ])

    expect(result.status).toBe('failed')
    expect(result).toMatchObject({ reason: 'no subject', providerId: 'local' })
  })

  it('reports honestly when the chain is empty', async () => {
    const result = await runCutoutProviders('img', [])

    expect(result.status).toBe('unavailable')
    expect(result.providerId).toBeUndefined()
  })

  it('reports honestly when every provider declined up front', async () => {
    const result = await runCutoutProviders('img', [
      { id: 'a', isAvailable: () => false, run: async () => SUCCESS },
    ])

    expect(result.status).toBe('unavailable')
  })
})

describe('the default chain preserves current behaviour', () => {
  it('is the local flood fill, alone', async () => {
    // Phase 2 introduces the seam, not a new capability. The moment this holds
    // more than one entry, default cutout behaviour has changed and that should
    // be a deliberate edit.
    expect(DEFAULT_CUTOUT_PROVIDERS).toEqual([localFloodFillProvider])
    expect(localFloodFillProvider.id).toBe('local-flood-fill')
  })

  it('leaves the local provider always available', async () => {
    // It is the permanent last resort; it must never decline up front.
    expect(localFloodFillProvider.isAvailable).toBeUndefined()
  })
})
