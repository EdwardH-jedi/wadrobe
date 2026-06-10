import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectUsableAlpha, pngDeclaresTransparency } from './proxy3dCutout'

// Synthetic PNG bytes: the probe only walks chunk headers (length + type) and
// reads the IHDR color type — it never inflates pixel data or checks CRCs —
// so structurally-correct bytes are enough.
const MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length)
  new DataView(out.buffer).setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  return out
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

function makePng(colorType: number, withTrns = false): Uint8Array<ArrayBuffer> {
  const ihdr = new Uint8Array(13)
  ihdr[9] = colorType // width/height/bitDepth left zeroed — probe ignores them
  const parts = [new Uint8Array(MAGIC), chunk('IHDR', ihdr)]
  if (withTrns) parts.push(chunk('tRNS', new Uint8Array(1)))
  parts.push(chunk('IDAT', new Uint8Array(4)), chunk('IEND', new Uint8Array(0)))
  return concat(parts)
}

describe('pngDeclaresTransparency', () => {
  it('detects alpha-channel color types', () => {
    expect(pngDeclaresTransparency(makePng(6))).toBe(true) // RGBA
    expect(pngDeclaresTransparency(makePng(4))).toBe(true) // gray+alpha
  })

  it('reports opaque color types without tRNS as no transparency', () => {
    expect(pngDeclaresTransparency(makePng(2))).toBe(false) // RGB
    expect(pngDeclaresTransparency(makePng(0))).toBe(false) // gray
    expect(pngDeclaresTransparency(makePng(3))).toBe(false) // palette, no tRNS
  })

  it('detects palette transparency via a tRNS chunk before IDAT', () => {
    expect(pngDeclaresTransparency(makePng(3, true))).toBe(true)
    expect(pngDeclaresTransparency(makePng(2, true))).toBe(true)
  })

  it('returns null for non-PNG or truncated bytes', () => {
    expect(pngDeclaresTransparency(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(
      pngDeclaresTransparency(new TextEncoder().encode('definitely not a png')),
    ).toBeNull()
    expect(
      pngDeclaresTransparency(new Uint8Array(MAGIC)), // magic only
    ).toBeNull()
  })
})

describe('detectUsableAlpha', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('verdicts an opaque-color-type PNG as none without needing a canvas', async () => {
    const verdict = await detectUsableAlpha(new Blob([makePng(2)]))
    expect(verdict).toBe('none')
  })

  it('falls back to unknown when alpha is declared but pixels cannot be read (jsdom)', async () => {
    // jsdom never decodes images — stub Image to fail fast instead of hanging.
    class FailingImage {
      onload: (() => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.(new Error('no decode here')))
      }
    }
    vi.stubGlobal('Image', FailingImage)
    const verdict = await detectUsableAlpha(new Blob([makePng(6)]))
    expect(verdict).toBe('unknown')
  })

  it('verdicts unreadable input as unknown (backend stays authoritative)', async () => {
    const verdict = await detectUsableAlpha(
      new Blob([new TextEncoder().encode('garbage')]),
    )
    expect(verdict).toBe('unknown')
  })
})
