import { afterEach, describe, expect, it, vi } from 'vitest'
import { downscaleDataUrl, processImageFile } from './imageFileUtils'

// jsdom has no image decoder, so we stub the global `Image` to drive decode
// success/failure deterministically. Both stubs live here so the boundary is
// legible: a decodable image resolves; an undecodable one rejects (no silent
// fallback to the broken source).
class OkImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  width = 200
  height = 240
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

class FailingImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  width = 0
  height = 0
  set src(_value: string) {
    queueMicrotask(() => this.onerror?.())
  }
}

describe('downscaleDataUrl decode boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects when the image cannot be decoded (no fallback to the source)', async () => {
    vi.stubGlobal('Image', FailingImage)
    await expect(
      downscaleDataUrl('data:image/jpeg;base64,broken'),
    ).rejects.toThrow()
  })

  it('resolves for a decodable image (returns the source when canvas is absent)', async () => {
    vi.stubGlobal('Image', OkImage)
    // jsdom has no 2d context, so the decoded-but-not-re-encoded path returns
    // the original data URL — this is the "valid upload still works" guard.
    await expect(
      downscaleDataUrl('data:image/jpeg;base64,valid'),
    ).resolves.toBe('data:image/jpeg;base64,valid')
  })
})

describe('processImageFile decode validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects a corrupt image-MIME file so it can never be archived', async () => {
    vi.stubGlobal('Image', FailingImage)
    const corrupt = new File(['not really a jpeg'], 'broken.jpg', {
      type: 'image/jpeg',
    })
    await expect(processImageFile(corrupt)).rejects.toThrow()
  })

  it('processes a decodable image-MIME file into a data URL', async () => {
    vi.stubGlobal('Image', OkImage)
    const ok = new File(['bytes'], 'tee.jpg', { type: 'image/jpeg' })
    const result = await processImageFile(ok)
    expect(result.dataUrl.startsWith('data:')).toBe(true)
  })
})
