// Tests for the optional serverless layer's request guards.
//
// This file lives under `src/` rather than beside the code it tests because
// `api/` is a separate compilation unit that Vitest does not collect (see
// `vite.config.ts` — `include: ['src/**/*.{test,spec}.{ts,tsx}']`). The guards
// it covers are security controls on unauthenticated routes that spend a paid
// API key, so "untested because of where the file sits" was the wrong trade.
import { describe, expect, it } from 'vitest'
import {
  IMAGE_BODY_BYTES,
  SMALL_BODY_BYTES,
  readCappedText,
  readJsonBody,
} from '../../api/_lib/http'

/** A Request-like object whose body streams in fixed-size chunks. */
function streamingRequest(text: string, declaredLength?: number): Request {
  const bytes = new TextEncoder().encode(text)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const chunk = 1024
      for (let i = 0; i < bytes.length; i += chunk) {
        controller.enqueue(bytes.slice(i, i + chunk))
      }
      controller.close()
    },
  })
  const headers = new Headers()
  if (declaredLength !== undefined) {
    headers.set('content-length', String(declaredLength))
  }
  return new Request('https://example.test/api', {
    method: 'POST',
    headers,
    body: stream,
    // Required by undici when the body is a stream.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

describe('readCappedText', () => {
  it('refuses an oversized body on the declared length alone', async () => {
    // The cheap path: an honest sender announces the size and never gets read.
    const req = streamingRequest('x'.repeat(100), SMALL_BODY_BYTES + 1)
    expect(await readCappedText(req, SMALL_BODY_BYTES)).toBeNull()
  })

  it('refuses an oversized body that lies about its length', async () => {
    // The path that matters: no content-length, or a false one. The cap has to
    // hold on bytes actually read, or it is decoration.
    const req = streamingRequest('x'.repeat(SMALL_BODY_BYTES + 500))
    expect(await readCappedText(req, SMALL_BODY_BYTES)).toBeNull()
  })

  it('returns a body that fits', async () => {
    const req = streamingRequest('hello')
    expect(await readCappedText(req, SMALL_BODY_BYTES)).toBe('hello')
  })
})

describe('readJsonBody', () => {
  it('parses a body within the cap', async () => {
    const req = streamingRequest(JSON.stringify({ url: 'https://shop.example' }))
    const result = await readJsonBody(req, SMALL_BODY_BYTES)
    expect(result).toEqual({ ok: true, value: { url: 'https://shop.example' } })
  })

  it('distinguishes "too large" from "not JSON"', async () => {
    // The caller answers 413 vs 400 off this distinction; collapsing them tells
    // an honest client with a big photo that its JSON is malformed.
    const big = streamingRequest(
      JSON.stringify({ imageDataUrl: 'x'.repeat(SMALL_BODY_BYTES) }),
    )
    expect(await readJsonBody(big, SMALL_BODY_BYTES)).toEqual({
      ok: false,
      reason: 'too-large',
    })

    const junk = streamingRequest('{not json')
    expect(await readJsonBody(junk, SMALL_BODY_BYTES)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('leaves room for a real thumbnail at the image cap', async () => {
    // A 768px JPEG at the app's quality is ~150 kB, ~200 kB base64-encoded.
    // The cap has to be comfortably above that or the vision path breaks for
    // ordinary photos.
    expect(IMAGE_BODY_BYTES).toBeGreaterThan(1_000_000)
    const thumbnail = JSON.stringify({
      imageDataUrl: `data:image/jpeg;base64,${'A'.repeat(300_000)}`,
    })
    const result = await readJsonBody(
      streamingRequest(thumbnail),
      IMAGE_BODY_BYTES,
    )
    expect(result.ok).toBe(true)
  })
})
