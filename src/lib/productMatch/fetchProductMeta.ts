// Front-end product-meta adapter (Phase 3). Bridges the reference step to the
// optional backend (`/api/product-meta`) through the analyzer/backend seam.
//
// Honest, cutout-style result contract: `success | unavailable | failed`. When
// no backend is configured (the default), it reports `unavailable` and the user
// keeps entering details manually — nothing is matched automatically and the
// user confirms every field before saving.
import { createBackendClient, type BackendClient } from '../ai/backendClient'
import type { ProductMeta } from './productMetaParse'

export type ProductMetaResult =
  | { status: 'success'; meta: ProductMeta }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string }

/** User-safe reason strings (honesty-guarded by fetchProductMeta.test.ts). */
export const PRODUCT_META_REASONS = {
  notConfigured: 'Product lookup is not set up in this build — enter details manually.',
  invalidUrl: 'Enter a valid product page link (https://…).',
  requestFailed: 'Could not read that product page — enter details manually.',
} as const

/** Cheap shape check for a pasteable http(s) link. */
export function isLikelyHttpUrl(url: string): boolean {
  return /^https?:\/\/\S+\.\S+/i.test(url.trim())
}

/**
 * Ask the backend to read a product page's declared metadata. Never throws:
 * a missing backend → `unavailable`, a bad URL or request error → `failed`.
 */
export async function fetchProductMeta(
  url: string,
  client: BackendClient = createBackendClient(),
): Promise<ProductMetaResult> {
  if (!client.available) {
    return { status: 'unavailable', reason: PRODUCT_META_REASONS.notConfigured }
  }
  if (!isLikelyHttpUrl(url)) {
    return { status: 'failed', reason: PRODUCT_META_REASONS.invalidUrl }
  }
  try {
    const meta = await client.postJson<ProductMeta>('api/product-meta', {
      url: url.trim(),
    })
    return { status: 'success', meta }
  } catch {
    return { status: 'failed', reason: PRODUCT_META_REASONS.requestFailed }
  }
}

/**
 * Draft fields a successful lookup may prefill. By design this does NOT touch the
 * garment `name` (already user-confirmed before the reference step is reachable),
 * nor `category`/`color` — those stay the user's call. The product name becomes
 * the reference `sourceLabel`.
 */
export interface ProductMetaPrefill {
  brand?: string
  price?: number
  currency?: string
  sourceLabel?: string
  sourceUrl?: string
  productReferenceImageUrl?: string
}

/** Map fetched metadata to the (non-destructive) prefill fields. */
export function productMetaToPrefill(meta: ProductMeta): ProductMetaPrefill {
  const out: ProductMetaPrefill = {}
  if (meta.brand) out.brand = meta.brand
  if (meta.price !== undefined) out.price = meta.price
  if (meta.currency) out.currency = meta.currency
  if (meta.name) out.sourceLabel = meta.name
  if (meta.sourceUrl) out.sourceUrl = meta.sourceUrl
  if (meta.imageUrl) out.productReferenceImageUrl = meta.imageUrl
  return out
}
