// Vercel serverless function (Edge runtime) — Wardrobe Flow C3.
//
// Optional shopping search: given the analysis-derived input, search eBay's
// Browse API and return REFERENCE CANDIDATES (title/brand/image/itemWebUrl) the
// user confirms — NO verified match, nothing stored. THIN WRAPPER: the query
// building, candidate mapping, and the SSRF url guard all live in the
// unit-tested `src/lib/candidates/ebaySearch.ts`; this file only does the HTTP
// (OAuth client-credentials token + the Browse call). Off by default — the keys
// are server-only (`EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`, never `VITE_`), so
// with them unset the endpoint reports "not configured" and the front end stays
// on the local mock candidates.
import {
  EBAY_BROWSE_SEARCH_URL,
  EBAY_OAUTH_URL,
  EBAY_SCOPE,
  EBAY_SEARCH_LIMIT,
  buildEbaySearchQuery,
  mapEbayItemsToCandidates,
} from '../src/lib/candidates/ebaySearch'
import type { ProductMatchInput } from '../src/lib/productMatch/productMatchTypes'
import { gateRequest, jsonResponse, type RateLimitRule } from './_lib/http'

export const config = { runtime: 'edge' }

const TIMEOUT_MS = 6000

// eBay's Browse API has a daily call quota, so this is the endpoint a runaway
// caller can actually exhaust. One archive session issues a handful of searches.
const RATE_LIMIT: RateLimitRule = { name: 'candidate-search', max: 20 }

// --- OAuth token cache ------------------------------------------------------
//
// eBay client-credentials tokens are valid for roughly two hours, so minting a
// new one per request wasted an OAuth round trip on every search (and eBay
// rate-limits token issuance separately from the Browse API).
//
// Module scope on the Edge runtime means per-isolate: a cold start begins with
// an empty cache. That is an ordinary MISS, not an error — `getEbayToken` just
// mints a fresh token and fills the cache for the isolate's remaining life.
// Several warm isolates each holding their own token is fine and expected.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000
// Only used if eBay ever omits `expires_in`; well under the real ~2h lifetime.
const TOKEN_FALLBACK_TTL_MS = 30 * 60_000

type TokenCacheEntry = { credentialKey: string; token: string; expiresAt: number }

let tokenCache: TokenCacheEntry | null = null

/**
 * Mint an OAuth token, reusing the cached one until it is within the refresh
 * margin of expiry. The cache is keyed on the credentials so rotating either
 * `EBAY_CLIENT_ID` or `EBAY_CLIENT_SECRET` cannot serve a token minted with the
 * previous pair.
 */
async function getEbayToken(
  clientId: string,
  clientSecret: string,
  signal: AbortSignal,
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const credentialKey = `${clientId}:${clientSecret}`
  if (!options.forceRefresh && tokenCache && tokenCache.credentialKey === credentialKey) {
    if (Date.now() < tokenCache.expiresAt - TOKEN_REFRESH_MARGIN_MS) return tokenCache.token
  }

  const res = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`,
  })
  if (!res.ok) return null
  const data = await res.json()
  const token = data && (data as { access_token?: unknown }).access_token
  if (typeof token !== 'string' || !token) return null

  const expiresIn = data && (data as { expires_in?: unknown }).expires_in
  const ttlMs =
    typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn * 1000
      : TOKEN_FALLBACK_TTL_MS
  tokenCache = { credentialKey, token, expiresAt: Date.now() + ttlMs }
  return token
}

export default async function handler(req: Request): Promise<Response> {
  const gate = gateRequest(req, RATE_LIMIT)
  if (!gate.ok) return gate.response
  const json = (body: unknown, status: number) => jsonResponse(body, status, gate.cors)

  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return json({ error: 'Candidate search is not configured' }, 500)
  }

  let input: ProductMatchInput
  try {
    const body = await req.json()
    if (!body || typeof body.category !== 'string') {
      return json({ error: 'category is required' }, 400)
    }
    input = body as ProductMatchInput
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const token = await getEbayToken(clientId, clientSecret, controller.signal)
    if (!token) {
      return json({ error: 'Could not authenticate with the search provider' }, 502)
    }
    const query = buildEbaySearchQuery(input)
    const url = `${EBAY_BROWSE_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${EBAY_SEARCH_LIMIT}`
    const search = (bearer: string) =>
      fetch(url, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
      })

    let res = await search(token)
    if (res.status === 401) {
      // A cached token can be revoked upstream before its stated expiry. Drop
      // it and retry once with a freshly minted one — without this, caching
      // could wedge an isolate into failing every search until it recycles.
      tokenCache = null
      const refreshed = await getEbayToken(clientId, clientSecret, controller.signal, {
        forceRefresh: true,
      })
      if (!refreshed) {
        return json({ error: 'Could not authenticate with the search provider' }, 502)
      }
      res = await search(refreshed)
    }
    if (!res.ok) return json({ error: `Search upstream responded ${res.status}` }, 502)
    const payload = await res.json()
    return json({ candidates: mapEbayItemsToCandidates(payload, input) }, 200)
  } catch {
    return json({ error: 'Could not reach the search provider' }, 502)
  } finally {
    clearTimeout(timer)
  }
}
