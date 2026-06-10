import { describe, expect, it, vi } from 'vitest'
import { Proxy3dApiError, createProxy3d, PROXY3D_ENDPOINT } from './proxy3dApi'
import type { Proxy3dRecord } from './proxy3dFlow'

const RECORD: Proxy3dRecord = {
  job_id: 'b'.repeat(32),
  status: 'done',
  method: 'textured-plane',
  alpha_mask_used: false,
  input: { width: 100, height: 80, has_alpha: false },
  mesh: { vertices: 4, faces: 2 },
  result_url: `/api/proxy-3d/${'b'.repeat(32)}/result.glb`,
  limitations: 'Proxy 3D preview only.',
  created_at: 1_750_000_000,
  sides: 'single',
  back_input: null,
  back_alpha_mask_used: null,
}

const PNG_BLOB = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
  type: 'image/png',
})

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('createProxy3d', () => {
  it('POSTs multipart form data and returns the parsed record', async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      expect(input).toBe(PROXY3D_ENDPOINT)
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)
      const form = init?.body as FormData
      const sent = form.get('file')
      expect(sent).toBeInstanceOf(File)
      expect((sent as File).name).toBe('tee.png')
      // No back image in the single-sided call.
      expect(form.get('back_file')).toBeNull()
      return jsonResponse(201, RECORD)
    })

    const record = await createProxy3d(PNG_BLOB, 'tee.png', { fetchFn })
    expect(record).toEqual(RECORD)
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('appends back_file for a dual-sided request (B3.7)', async () => {
    const backBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
      type: 'image/png',
    })
    const fetchFn = vi.fn(async (_input: string, init?: RequestInit) => {
      const form = init?.body as FormData
      const back = form.get('back_file')
      expect(back).toBeInstanceOf(File)
      expect((back as File).name).toBe('back-cutout.png')
      return jsonResponse(201, { ...RECORD, sides: 'dual' })
    })

    const record = await createProxy3d(PNG_BLOB, 'tee.png', {
      back: backBlob,
      backName: 'back-cutout.png',
      fetchFn,
    })
    expect(record.sides).toBe('dual')
  })

  it('sends manual back-alignment fields with a dual request (B3.8)', async () => {
    const backBlob = new Blob([new Uint8Array([0x89])], { type: 'image/png' })
    const fetchFn = vi.fn(async (_input: string, init?: RequestInit) => {
      const form = init?.body as FormData
      expect(form.get('back_scale')).toBe('1.5')
      expect(form.get('back_offset_x')).toBe('0.2')
      expect(form.get('back_offset_y')).toBe('-0.1')
      return jsonResponse(201, { ...RECORD, sides: 'dual' })
    })
    await createProxy3d(PNG_BLOB, 'tee.png', {
      back: backBlob,
      backScale: 1.5,
      backOffsetX: 0.2,
      backOffsetY: -0.1,
      fetchFn,
    })
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('omits alignment fields on single-sided requests', async () => {
    const fetchFn = vi.fn(async (_input: string, init?: RequestInit) => {
      const form = init?.body as FormData
      expect(form.get('back_scale')).toBeNull()
      return jsonResponse(201, RECORD)
    })
    await createProxy3d(PNG_BLOB, 'tee.png', { backScale: 1.5, fetchFn })
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('surfaces the backend detail message on HTTP errors', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(422, { detail: 'The PNG is fully transparent.' }),
    )
    const error = await createProxy3d(PNG_BLOB, 'x.png', { fetchFn }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Proxy3dApiError)
    expect((error as Proxy3dApiError).message).toBe(
      'The PNG is fully transparent.',
    )
    expect((error as Proxy3dApiError).status).toBe(422)
  })

  it('reports a non-JSON 5xx as the backend not answering (proxy-down case)', async () => {
    // The Vite dev proxy turns a refused connection into a bare 500 — the
    // honest message is "backend not answering", not "backend rejected".
    const fetchFn = vi.fn(
      async () => new Response('<html>boom</html>', { status: 500 }),
    )
    const error = await createProxy3d(PNG_BLOB, 'x.png', { fetchFn }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Proxy3dApiError)
    expect((error as Proxy3dApiError).message).toMatch(/did not answer/i)
    expect((error as Proxy3dApiError).message).toMatch(/HTTP 500/)
    expect((error as Proxy3dApiError).status).toBe(500)
  })

  it('keeps the backend detail for a JSON 5xx (a real backend error)', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(500, { detail: 'GLB export produced an invalid file.' }),
    )
    const error = await createProxy3d(PNG_BLOB, 'x.png', { fetchFn }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Proxy3dApiError)
    expect((error as Proxy3dApiError).message).toBe(
      'GLB export produced an invalid file.',
    )
  })

  it('falls back to a generic message for a non-JSON 4xx', async () => {
    const fetchFn = vi.fn(
      async () => new Response('nope', { status: 413 }),
    )
    const error = await createProxy3d(PNG_BLOB, 'x.png', { fetchFn }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Proxy3dApiError)
    expect((error as Proxy3dApiError).message).toMatch(
      /rejected the request \(HTTP 413\)/,
    )
  })

  it('reports an unreachable backend with a null status', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const error = await createProxy3d(PNG_BLOB, 'x.png', { fetchFn }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Proxy3dApiError)
    expect((error as Proxy3dApiError).status).toBeNull()
    expect((error as Proxy3dApiError).message).toMatch(/could not reach/i)
  })
})
