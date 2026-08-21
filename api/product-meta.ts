// Vercel serverless function (Edge runtime) — Track A, Phase 3 (backend 2A).
//
// Reads a product page the user pasted and returns the page's OWN declared
// metadata (schema.org Product JSON-LD / OpenGraph). It performs NO recognition
// and stores nothing; the user confirms every field before saving. THIN WRAPPER:
// all parsing + URL validation live in the unit-tested `src` modules, so this
// file stays trivial. It is covered by `eslint` and by `npm run typecheck`
// (via `tsconfig.api.json`), but not by the Vitest suite -- the logic it wraps
// is what the unit tests exercise.
//
// Safety: an origin allowlist + per-caller throttle in front (see `_lib/http`),
// then http(s) only, public hosts only, every redirect hop re-validated (SSRF),
// a request timeout and a response-size cap.
import { parseProductMeta } from '../src/lib/productMatch/productMetaParse'
import { validateFetchTarget } from '../src/lib/productMatch/urlGuard'
import {
  gateRequest,
  jsonResponse,
  optionalApisEnabled,
  readCappedText,
  type RateLimitRule,
} from './_lib/http'

export const config = { runtime: 'edge' }

const MAX_BYTES = 1_500_000
const TIMEOUT_MS = 6000
const MAX_REDIRECTS = 3

// Each call is one outbound page fetch — cheap, but it is also an
// attacker-controlled fetch, so keep the ceiling modest.
const RATE_LIMIT: RateLimitRule = { name: 'product-meta', max: 20 }

export default async function handler(req: Request): Promise<Response> {
  // Off unless the deployment explicitly opts in (see `optionalApisEnabled`).
  if (!optionalApisEnabled()) return new Response('Not found', { status: 404 })

  const gate = gateRequest(req, RATE_LIMIT)
  if (!gate.ok) return gate.response
  const json = (body: unknown, status: number) => jsonResponse(body, status, gate.cors)

  let rawUrl = ''
  try {
    const body = await req.json()
    rawUrl = body && typeof body.url === 'string' ? body.url : ''
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const first = validateFetchTarget(rawUrl)
  if (!first.ok) return json({ error: first.reason }, 400)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let current = first.url
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'FitArchiveBot/1.0 (+product-meta)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location) return json({ error: 'Bad redirect' }, 502)
        // Re-validate every hop so a redirect can't reach an internal host.
        const next = validateFetchTarget(new URL(location, current).toString())
        if (!next.ok) return json({ error: 'Blocked redirect' }, 400)
        current = next.url
        continue
      }

      if (!res.ok) return json({ error: `Upstream responded ${res.status}` }, 502)

      // Streamed, not buffered-then-sliced: `res.text()` would hold the whole
      // body in memory before any cap could apply.
      const html = await readCappedText(res, MAX_BYTES)
      if (html === null) return json({ error: 'Product page is too large' }, 502)
      return json(parseProductMeta(html, current), 200)
    }
    return json({ error: 'Too many redirects' }, 502)
  } catch {
    return json({ error: 'Could not read the product page' }, 502)
  } finally {
    clearTimeout(timer)
  }
}
