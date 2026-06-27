// Phase 3: product-meta adapter — honest success/unavailable/failed contract,
// the non-destructive prefill mapping, and reason-string honesty.
import { describe, expect, it, vi } from 'vitest'
import type { BackendClient } from '../ai/backendClient'
import type { ProductMeta } from './productMetaParse'
import {
  PRODUCT_META_REASONS,
  fetchProductMeta,
  isLikelyHttpUrl,
  productMetaToPrefill,
} from './fetchProductMeta'
import { FORBIDDEN_CLAIM_TERMS } from '../../test/honesty'

function fakeClient(over: Partial<BackendClient> = {}): BackendClient {
  return {
    available: true,
    apiBase: 'https://api.example',
    postJson: vi.fn().mockResolvedValue({ sourceUrl: 'x' } as ProductMeta),
    ...over,
  }
}

const META: ProductMeta = {
  name: 'Wool Overcoat',
  brand: 'Maison Grey',
  price: 320,
  currency: 'GBP',
  imageUrl: 'https://img.example/coat.jpg',
  sourceUrl: 'https://shop.example/p/1',
}

describe('isLikelyHttpUrl', () => {
  it('accepts http(s) links and rejects junk', () => {
    expect(isLikelyHttpUrl('https://shop.example/p/1')).toBe(true)
    expect(isLikelyHttpUrl('  http://a.co ')).toBe(true)
    expect(isLikelyHttpUrl('shop.example')).toBe(false)
    expect(isLikelyHttpUrl('')).toBe(false)
  })
})

describe('fetchProductMeta', () => {
  it('reports unavailable when no backend is configured (default)', async () => {
    const client = fakeClient({ available: false, apiBase: null })
    const result = await fetchProductMeta('https://shop.example/p/1', client)
    expect(result).toEqual({
      status: 'unavailable',
      reason: PRODUCT_META_REASONS.notConfigured,
    })
    expect(client.postJson).not.toHaveBeenCalled()
  })

  it('fails on an invalid URL without calling the backend', async () => {
    const client = fakeClient()
    const result = await fetchProductMeta('not-a-url', client)
    expect(result.status).toBe('failed')
    expect(client.postJson).not.toHaveBeenCalled()
  })

  it('posts the trimmed url to the product-meta route and returns the meta', async () => {
    const postJson = vi.fn().mockResolvedValue(META)
    const client = fakeClient({ postJson })
    const result = await fetchProductMeta('  https://shop.example/p/1 ', client)
    expect(postJson).toHaveBeenCalledWith('api/product-meta', {
      url: 'https://shop.example/p/1',
    })
    expect(result).toEqual({ status: 'success', meta: META })
  })

  it('fails gracefully when the backend request throws', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockRejectedValue(new Error('500')),
    })
    const result = await fetchProductMeta('https://shop.example/p/1', client)
    expect(result).toEqual({
      status: 'failed',
      reason: PRODUCT_META_REASONS.requestFailed,
    })
  })

  it('reason strings never imply real recognition / AI', () => {
    for (const reason of Object.values(PRODUCT_META_REASONS)) {
      expect(reason).not.toMatch(FORBIDDEN_CLAIM_TERMS)
    }
  })
})

describe('productMetaToPrefill', () => {
  it('maps brand/price/currency + reference fields, never the garment name', () => {
    const prefill = productMetaToPrefill(META)
    expect(prefill).toEqual({
      brand: 'Maison Grey',
      price: 320,
      currency: 'GBP',
      sourceLabel: 'Wool Overcoat', // product name → reference label, not name
      sourceUrl: 'https://shop.example/p/1',
      productReferenceImageUrl: 'https://img.example/coat.jpg',
    })
    expect('name' in prefill).toBe(false)
    expect('category' in prefill).toBe(false)
    expect('color' in prefill).toBe(false)
  })

  it('omits fields the page did not provide', () => {
    expect(productMetaToPrefill({ sourceUrl: 'https://x.co' })).toEqual({
      sourceUrl: 'https://x.co',
    })
  })
})
