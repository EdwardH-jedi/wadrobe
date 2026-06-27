// Vercel serverless function (Edge runtime) — Track A, Phase 3 (backend 2A).
//
// Reads a product page the user pasted and returns the page's OWN declared
// metadata (schema.org Product JSON-LD / OpenGraph). It performs NO recognition
// and stores nothing; the user confirms every field before saving. THIN WRAPPER:
// all parsing + URL validation live in the unit-tested `src` modules, so this
// file stays trivial (it is verified only by `eslint`, not tsc/build/tests).
//
// Safety: http(s) only, public hosts only, every redirect hop re-validated
// (SSRF), a request timeout and a response-size cap.
import { parseProductMeta } from '../src/lib/productMatch/productMetaParse'
import { validateFetchTarget } from '../src/lib/productMatch/urlGuard'

export const config = { runtime: 'edge' }

const MAX_BYTES = 1_500_000
const TIMEOUT_MS = 6000
const MAX_REDIRECTS = 3

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

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

      const html = await res.text()
      const capped = html.length > MAX_BYTES ? html.slice(0, MAX_BYTES) : html
      return json(parseProductMeta(capped, current), 200)
    }
    return json({ error: 'Too many redirects' }, 502)
  } catch {
    return json({ error: 'Could not read the product page' }, 502)
  } finally {
    clearTimeout(timer)
  }
}
