// Phase 2 + 4: analyzer provider seam. Default is mock; the backend vision path
// requires BOTH VITE_API_BASE and VITE_ANALYZER=vision (so Phase 3 prefill can
// set the base without turning on per-upload vision).
import { describe, expect, it, vi } from 'vitest'
import {
  createBackendClient,
  resolveApiBase,
  type BackendClient,
} from './backendClient'
import {
  type AnalyzerEnv,
  createAnalyzer,
  createBackendAnalyzer,
  selectAnalyzerKind,
} from './createAnalyzer'

const UNSET: AnalyzerEnv = {}
const BASE_ONLY: AnalyzerEnv = { VITE_API_BASE: 'https://archive.vercel.app/' }
const VISION: AnalyzerEnv = {
  VITE_API_BASE: 'https://archive.vercel.app/',
  VITE_ANALYZER: 'vision',
}

function fakeClient(over: Partial<BackendClient> = {}): BackendClient {
  return {
    available: true,
    apiBase: 'https://api.example',
    postJson: vi.fn(),
    ...over,
  }
}

describe('resolveApiBase', () => {
  it('returns null for unset/blank and normalizes a configured base', () => {
    expect(resolveApiBase(UNSET)).toBeNull()
    expect(resolveApiBase({ VITE_API_BASE: '   ' })).toBeNull()
    expect(resolveApiBase(BASE_ONLY)).toBe('https://archive.vercel.app')
  })
})

describe('selectAnalyzerKind', () => {
  it('defaults to mock — even when only the API base is set', () => {
    expect(selectAnalyzerKind(UNSET)).toBe('mock')
    expect(selectAnalyzerKind(BASE_ONLY)).toBe('mock') // base alone does NOT enable vision
  })

  it('selects backend only when base + VITE_ANALYZER=vision are both set', () => {
    expect(selectAnalyzerKind(VISION)).toBe('backend')
    // The flag without a base is still mock (nowhere to send).
    expect(selectAnalyzerKind({ VITE_ANALYZER: 'vision' })).toBe('mock')
  })
})

describe('createAnalyzer', () => {
  it('builds a mock analyzer by default and when only the base is set', () => {
    expect(createAnalyzer(UNSET).kind).toBe('mock')
    expect(createAnalyzer(BASE_ONLY).kind).toBe('mock')
    expect(createAnalyzer(UNSET).backend).toBeUndefined()
  })

  it('builds a backend analyzer with a configured client under the vision flag', () => {
    const analyzer = createAnalyzer(VISION)
    expect(analyzer.kind).toBe('backend')
    expect(analyzer.backend?.available).toBe(true)
    expect(analyzer.backend?.apiBase).toBe('https://archive.vercel.app')
  })

  it('the mock path produces a valid local guess (default behavior intact)', async () => {
    const guess = await createAnalyzer(UNSET).analyze({ fileName: 'navy-wool-coat.jpg' })
    expect(guess.category).toBe('outerwear')
    expect(guess.source).toBe('mock')
  })
})

describe('createBackendAnalyzer', () => {
  const input = {
    fileName: 'navy-coat.jpg',
    imageDataUrl: 'data:image/jpeg;base64,QUJD',
    dominantColorHex: '#1b2a4a',
  }

  it('posts the thumbnail and maps a successful vision result', async () => {
    const postJson = vi.fn().mockResolvedValue({
      category: 'outerwear',
      color: 'Navy',
      colorHex: '#1b2a4a',
      styleTags: ['tailored'],
      confidence: 0.9,
    })
    const guess = await createBackendAnalyzer(fakeClient({ postJson })).analyze(input)
    expect(postJson).toHaveBeenCalledWith('api/analyze', {
      imageDataUrl: input.imageDataUrl,
      fileName: input.fileName,
      dominantColorHex: input.dominantColorHex,
    })
    expect(guess.source).toBe('vision-api')
    expect(guess.category).toBe('outerwear')
  })

  it('falls back to the mock (source mock) when there is no image', async () => {
    const postJson = vi.fn()
    const guess = await createBackendAnalyzer(fakeClient({ postJson })).analyze({
      fileName: 'navy-wool-coat.jpg',
    })
    expect(postJson).not.toHaveBeenCalled()
    expect(guess.source).toBe('mock')
    expect(guess.category).toBe('outerwear')
  })

  it('falls back to the mock when the request fails or returns garbage', async () => {
    const failing = await createBackendAnalyzer(
      fakeClient({ postJson: vi.fn().mockRejectedValue(new Error('500')) }),
    ).analyze(input)
    expect(failing.source).toBe('mock')

    const garbage = await createBackendAnalyzer(
      fakeClient({ postJson: vi.fn().mockResolvedValue({ category: 'invalid' }) }),
    ).analyze(input)
    expect(garbage.source).toBe('mock')
  })
})

describe('createBackendClient', () => {
  it('is unavailable when unconfigured and available with a normalized base', () => {
    expect(createBackendClient(UNSET).available).toBe(false)
    expect(createBackendClient(BASE_ONLY).apiBase).toBe('https://archive.vercel.app')
  })
})
