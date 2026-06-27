// eBay Browse search → reference candidates (Wardrobe Flow C3, pure logic).
//
// These helpers are the unit-tested core the thin `api/candidate-search.ts`
// serverless wrapper uses: build a keyword query from the analysis-derived
// input, and map an eBay Browse `item_summary/search` response onto the EXISTING
// ProductMatchCandidate shape (so downstream pick/prefill/approve/archive is
// unchanged). Every item URL is run through the existing SSRF url guard, and
// items without a safe public URL are dropped. These are demo-grade references
// the user confirms — never a verified match.
import { validateFetchTarget } from '../productMatch/urlGuard'
import type {
  ProductMatchCandidate,
  ProductMatchInput,
} from '../productMatch/productMatchTypes'

export const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
export const EBAY_BROWSE_SEARCH_URL =
  'https://api.ebay.com/buy/browse/v1/item_summary/search'
export const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope'
export const EBAY_SEARCH_LIMIT = 6

/** Build a de-duplicated keyword query from the analysis-derived input. */
export function buildEbaySearchQuery(input: ProductMatchInput): string {
  const parts = [
    input.brand,
    input.color,
    ...(input.styleTags ?? []),
    input.category,
  ]
  const seen = new Set<string>()
  const words: string[] = []
  for (const part of parts) {
    if (typeof part !== 'string') continue
    const word = part.trim()
    const key = word.toLowerCase()
    if (word && !seen.has(key)) {
      seen.add(key)
      words.push(word)
    }
  }
  return words.join(' ').slice(0, 100)
}

interface EbayItemSummary {
  title?: unknown
  itemWebUrl?: unknown
  image?: { imageUrl?: unknown }
  brand?: unknown
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function extractItemSummaries(payload: unknown): unknown[] {
  if (payload && typeof payload === 'object' && 'itemSummaries' in payload) {
    const arr = (payload as { itemSummaries?: unknown }).itemSummaries
    return Array.isArray(arr) ? arr : []
  }
  return []
}

/**
 * Map an eBay Browse search response to reference candidates. Defensive against
 * unknown JSON; drops items missing a title or a SSRF-safe public itemWebUrl.
 */
export function mapEbayItemsToCandidates(
  payload: unknown,
  input: ProductMatchInput,
): ProductMatchCandidate[] {
  const candidates: ProductMatchCandidate[] = []
  extractItemSummaries(payload).forEach((raw, index) => {
    const item = raw as EbayItemSummary
    const title = asString(item.title)
    const rawUrl = asString(item.itemWebUrl)
    if (!title || !rawUrl) return
    const guard = validateFetchTarget(rawUrl)
    if (!guard.ok) return // non-public / non-http(s) URL — drop it
    candidates.push({
      id: `search-ebay-${index}`,
      productName: title,
      brand: asString(item.brand),
      sourceUrl: guard.url,
      imageUrl: asString(item.image?.imageUrl),
      confidence: 0.5,
      reason: 'Shopping search result — confirm or edit (not a verified match).',
      tags: [input.category],
      candidateType: 'reference',
    })
  })
  return candidates
}
