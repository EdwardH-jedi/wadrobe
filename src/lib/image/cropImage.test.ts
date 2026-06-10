import { afterEach, describe, expect, it, vi } from 'vitest'
import { cropImageToDataUrl } from './cropImage'
import { IDENTITY_CROP_RECT } from './cropGeometry'

// Same approach as imageFileUtils.test: jsdom has no image decoder or 2d canvas
// context, so we stub `Image` to drive decode success/failure. We assert the
// graceful, canvas-free behavior (identity → source; no canvas → source; decode
// failure → reject), NOT real pixel output (that needs a browser; covered by the
// pure geometry tests + the real-Chrome eyeball).
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

describe('cropImageToDataUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the source unchanged for an identity (no-op) crop', async () => {
    vi.stubGlobal('Image', OkImage)
    await expect(
      cropImageToDataUrl('data:image/jpeg;base64,valid', IDENTITY_CROP_RECT),
    ).resolves.toBe('data:image/jpeg;base64,valid')
  })

  it('falls back to the source when canvas is unavailable (jsdom)', async () => {
    vi.stubGlobal('Image', OkImage)
    // A real crop rect, but jsdom has no 2d context → graceful no-op, valid image.
    await expect(
      cropImageToDataUrl('data:image/jpeg;base64,valid', {
        x: 0.1,
        y: 0.1,
        width: 0.5,
        height: 0.5,
      }),
    ).resolves.toBe('data:image/jpeg;base64,valid')
  })

  it('rejects when the image cannot be decoded (never archives a broken crop)', async () => {
    vi.stubGlobal('Image', FailingImage)
    await expect(
      cropImageToDataUrl('data:image/jpeg;base64,broken', IDENTITY_CROP_RECT),
    ).rejects.toThrow()
  })
})
