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

export const config = { runtime: 'edge' }

const TIMEOUT_MS = 6000

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function fetchEbayToken(
  clientId: string,
  clientSecret: string,
  signal: AbortSignal,
): Promise<string | null> {
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
  return typeof token === 'string' ? token : null
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

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
    const token = await fetchEbayToken(clientId, clientSecret, controller.signal)
    if (!token) {
      return json({ error: 'Could not authenticate with the search provider' }, 502)
    }
    const query = buildEbaySearchQuery(input)
    const url = `${EBAY_BROWSE_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${EBAY_SEARCH_LIMIT}`
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) return json({ error: `Search upstream responded ${res.status}` }, 502)
    const payload = await res.json()
    return json({ candidates: mapEbayItemsToCandidates(payload, input) }, 200)
  } catch {
    return json({ error: 'Could not reach the search provider' }, 502)
  } finally {
    clearTimeout(timer)
  }
}
