import { describe, expect, it, vi } from 'vitest'
import {
  attemptMlCutout,
  mlCutoutEnabled,
  type MlCutoutDeps,
} from './mlCutout'

const IMG = 'data:image/png;base64,AAAA'
const ON = { VITE_API_BASE: 'http://api.test', VITE_CUTOUT: 'ml' }

function fakeDeps(fetchImpl: () => Promise<unknown>): MlCutoutDeps {
  return {
    fetch: vi.fn(fetchImpl) as unknown as typeof fetch,
    blobToDataUrl: vi.fn(async () => 'data:image/png;base64,CUTOUT'),
  }
}

describe('mlCutoutEnabled (opt-in flag only; no VITE_API_BASE required)', () => {
  it('is enabled by VITE_CUTOUT=ml ALONE (same-origin via the dev proxy)', () => {
    // Regression: requiring VITE_API_BASE forced a cross-origin request the
    // backend has no CORS for, so ML silently fell back and never rendered.
    expect(mlCutoutEnabled({ VITE_CUTOUT: 'ml' })).toBe(true)
    expect(mlCutoutEnabled(ON)).toBe(true)
  })

  it('is off when the opt-in flag is absent (default build = network-free)', () => {
    expect(mlCutoutEnabled({})).toBe(false)
    expect(mlCutoutEnabled({ VITE_API_BASE: 'http://x' })).toBe(false)
  })
})

describe('attemptMlCutout — env gate keeps the default build network-free', () => {
  it('makes ZERO network calls when the gate is off', async () => {
    const deps = fakeDeps(async () => ({ ok: true, blob: async () => new Blob() }))
    const res = await attemptMlCutout(IMG, {}, deps)
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(res.status).toBe('unavailable')
  })

  it('makes ZERO network calls when only the base is set (no ml opt-in)', async () => {
    const deps = fakeDeps(async () => ({ ok: true, blob: async () => new Blob() }))
    await attemptMlCutout(IMG, { VITE_API_BASE: 'http://x' }, deps)
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('POSTs to the RELATIVE /api/cutout (dev proxy) when no base is set', async () => {
    // The fix: same-origin path so the Vite proxy forwards to the backend and no
    // CORS is needed — the shape that actually reaches the server in dev.
    const out = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const deps = fakeDeps(async () => ({ ok: true, blob: async () => out }))
    const res = await attemptMlCutout(IMG, { VITE_CUTOUT: 'ml' }, deps)

    expect(deps.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (deps.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    expect(url).toBe('/api/cutout')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect(res).toMatchObject({
      status: 'success',
      source: 'ml-backend',
      cutoutImageUrl: 'data:image/png;base64,CUTOUT',
    })
  })

  it('uses an absolute VITE_API_BASE as an OPTIONAL override (split deploy)', async () => {
    const out = new Blob([new Uint8Array([1])], { type: 'image/png' })
    const deps = fakeDeps(async () => ({ ok: true, blob: async () => out }))
    await attemptMlCutout(IMG, ON, deps)
    const [url] = (deps.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('http://api.test/api/cutout')
  })

  it('resolves an object-URL (blob:) source via fetch, then POSTs (hydrated assets)', async () => {
    // getGarmentDisplayImage can be an IndexedDB object URL, not a data: URL.
    const out = new Blob([new Uint8Array([9])], { type: 'image/png' })
    const deps = fakeDeps(async () => ({ ok: true, blob: async () => out }))
    const res = await attemptMlCutout('blob:http://app/abc', ON, deps)

    expect(res.status).toBe('success')
    const calls = (deps.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    // Two fetches: (1) resolve the object URL to a blob, (2) POST /api/cutout.
    expect(calls).toHaveLength(2)
    expect(calls[0][0]).toBe('blob:http://app/abc')
    expect(calls[1][0]).toBe('http://api.test/api/cutout')
  })

  it('does NOT fetch a remote (http) source — avoids a cross-origin leak', async () => {
    const deps = fakeDeps(async () => ({ ok: true, blob: async () => new Blob() }))
    const res = await attemptMlCutout('https://cdn.example/product.jpg', ON, deps)
    // A remote product-reference image is never fetched; it degrades locally.
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(res.status).toBe('failed')
  })

  it('degrades to failed (never throws) on a non-ok response', async () => {
    const deps = fakeDeps(async () => ({ ok: false, blob: async () => new Blob() }))
    const res = await attemptMlCutout(IMG, ON, deps)
    expect(res.status).toBe('failed')
  })

  it('degrades to failed when fetch itself throws', async () => {
    const deps = fakeDeps(async () => {
      throw new Error('network down')
    })
    const res = await attemptMlCutout(IMG, ON, deps)
    expect(res.status).toBe('failed')
  })
})
