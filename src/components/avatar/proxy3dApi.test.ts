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
      const sent = (init?.body as FormData).get('file')
      expect(sent).toBeInstanceOf(File)
      expect((sent as File).name).toBe('tee.png')
      return jsonResponse(201, RECORD)
    })

    const record = await createProxy3d(PNG_BLOB, 'tee.png', fetchFn)
    expect(record).toEqual(RECORD)
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('surfaces the backend detail message on HTTP errors', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(422, { detail: 'The PNG is fully transparent.' }),
    )
    const error = await createProxy3d(PNG_BLOB, 'x.png', fetchFn).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Proxy3dApiError)
    expect((error as Proxy3dApiError).message).toBe(
      'The PNG is fully transparent.',
    )
    expect((error as Proxy3dApiError).status).toBe(422)
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    const fetchFn = vi.fn(
      async () => new Response('<html>boom</html>', { status: 500 }),
    )
    const error = await createProxy3d(PNG_BLOB, 'x.png', fetchFn).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Proxy3dApiError)
    expect((error as Proxy3dApiError).message).toMatch(/HTTP 500/)
  })

  it('reports an unreachable backend with a null status', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const error = await createProxy3d(PNG_BLOB, 'x.png', fetchFn).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Proxy3dApiError)
    expect((error as Proxy3dApiError).status).toBeNull()
    expect((error as Proxy3dApiError).message).toMatch(/could not reach/i)
  })
})
