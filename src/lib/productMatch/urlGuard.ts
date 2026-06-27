// SSRF guard for the Phase 3 product-meta fetcher. Validates that a
// user-supplied URL is a PUBLIC http(s) target before the server fetches it,
// and is re-applied to every redirect hop (a redirect to an internal address
// would otherwise bypass an input-only check). Pure + unit-tested; imported by
// the `/api/product-meta` handler.

export type FetchTarget =
  | { ok: true; url: string }
  | { ok: false; reason: string }

const BLOCKED_EXACT = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '[::1]',
])

/** True for loopback / private / link-local / internal-only hosts. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (BLOCKED_EXACT.has(hostname.toLowerCase()) || BLOCKED_EXACT.has(h)) return true
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.internal') ||
    h.endsWith('.local')
  ) {
    return true
  }
  // IPv4 loopback / private / link-local ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  // IPv6 unique-local (fc00::/7) / link-local (fe80::/10).
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  return false
}

/** Validate + normalize an absolute http(s) URL pointing at a public host. */
export function validateFetchTarget(raw: string): FetchTarget {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: 'Invalid URL' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http(s) URLs are allowed' }
  }
  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, reason: 'That host is not allowed' }
  }
  return { ok: true, url: parsed.toString() }
}
