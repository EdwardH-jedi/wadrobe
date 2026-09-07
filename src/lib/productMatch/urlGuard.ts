// SSRF guard for the Phase 3 product-meta fetcher. Validates that a
// user-supplied URL is a PUBLIC http(s) target before the server fetches it,
// and is re-applied to every redirect hop (a redirect to an internal address
// would otherwise bypass an input-only check). Pure + unit-tested; imported by
// the `/api/product-meta` handler.
//
// Two things this file learned the hard way, both worth stating up front:
//
// 1. **Do not pattern-match the hostname as text.** An earlier version tested
//    `hostname.startsWith('fd')` for unique-local IPv6 — which also blocks
//    `fdny.gov`, and misses `::ffff:7f00:1` entirely. Addresses are parsed into
//    numbers here and compared as numbers; only genuine DNS names are matched
//    as text, and then only by suffix.
// 2. **Trust the URL parser's normalisation, then re-check.** WHATWG `URL`
//    already folds `http://2130706433/`, `http://0x7f.0.0.1/` and
//    `http://127.1/` to `127.0.0.1`, so the dotted-quad check catches all of
//    them. It does NOT fold IPv4-mapped IPv6, which is why that is expanded
//    below rather than assumed away.
//
// What this CANNOT stop: DNS rebinding. A public name that resolves to a
// private address after the check has passed will be fetched. Closing that
// needs resolve-then-connect-to-the-resolved-IP, which the Edge runtime does
// not expose. It is a documented limitation, not an oversight.

export type FetchTarget =
  | { ok: true; url: string }
  | { ok: false; reason: string }

/** DNS suffixes that only ever name something inside a network. */
const PRIVATE_SUFFIXES = [
  '.localhost',
  '.internal',
  '.local',
  '.home.arpa',
  '.intranet',
]

const PRIVATE_NAMES = new Set(['localhost', 'broadcasthost'])

/**
 * True for an IPv4 address that must never be fetched server-side.
 *
 * Covers the obvious loopback/private ranges plus three that a naive guard
 * misses and an attacker does not: 100.64/10 (carrier-grade NAT, routable
 * inside many hosting networks), 192.0.0.0/24 (IETF protocol assignments) and
 * 198.18/15 (benchmarking). 169.254/16 covers the cloud metadata endpoint at
 * 169.254.169.254, which is the single highest-value SSRF target there is.
 */
function isPrivateIpv4(a: number, b: number): boolean {
  if (a === 0) return true // "this network"
  if (a === 10) return true // RFC 1918
  if (a === 127) return true // loopback
  if (a === 100 && b >= 64 && b <= 127) return true // RFC 6598 CGNAT
  if (a === 169 && b === 254) return true // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // RFC 1918
  if (a === 192 && b === 0) return true // 192.0.0.0/24 protocol assignments
  if (a === 192 && b === 168) return true // RFC 1918
  if (a === 198 && (b === 18 || b === 19)) return true // RFC 2544 benchmarking
  if (a >= 224) return true // multicast, reserved, broadcast
  return false
}

/** Parse a dotted-quad, or null when the text is not one. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
  if (parts.some((n) => n > 255)) return null
  return parts as [number, number, number, number]
}

/**
 * Expand an IPv6 literal to its eight 16-bit groups, or null if it is not one.
 * Handles `::` compression and a trailing dotted-quad (`::ffff:127.0.0.1`).
 */
export function parseIpv6(host: string): number[] | null {
  let text = host.toLowerCase()
  if (!text.includes(':')) return null

  // A trailing IPv4 literal becomes the last two groups.
  const v4 = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4) {
    const octets = parseIpv4(v4[1])
    if (!octets) return null
    const hi = ((octets[0] << 8) | octets[1]).toString(16)
    const lo = ((octets[2] << 8) | octets[3]).toString(16)
    text = `${text.slice(0, v4.index)}${hi}:${lo}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null
  const split = (part: string) => (part === '' ? [] : part.split(':'))
  const head = split(halves[0])
  const tail = halves.length === 2 ? split(halves[1]) : []

  let groups: string[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 1) return null
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail]
  } else {
    if (head.length !== 8) return null
    groups = head
  }

  const out: number[] = []
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    out.push(parseInt(group, 16))
  }
  return out
}

/** True for an IPv6 address that must never be fetched server-side. */
function isPrivateIpv6(groups: number[]): boolean {
  // `::`, `::1`, and every IPv4-compatible/mapped form share an all-zero
  // 96-bit prefix (bar the `ffff` marker). Nothing public looks like this, so
  // the whole space is refused — and where it embeds an IPv4 address, that
  // address is checked on its own terms rather than waved through.
  const zeroPrefix = groups.slice(0, 5).every((g) => g === 0)
  if (zeroPrefix && (groups[5] === 0 || groups[5] === 0xffff)) {
    const a = groups[6] >> 8
    const b = groups[6] & 0xff
    // `::` and `::1` land here as 0.0.0.0 / 0.0.0.1 → `a === 0` → blocked.
    return isPrivateIpv4(a, b)
  }
  if ((groups[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((groups[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  return false
}

/** True for loopback / private / link-local / internal-only hosts. */
export function isPrivateHost(hostname: string): boolean {
  // `URL.hostname` keeps the brackets on an IPv6 literal; strip them so the
  // same function works on a raw host string too.
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host.length === 0) return true
  if (PRIVATE_NAMES.has(host)) return true
  if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true

  const v4 = parseIpv4(host)
  if (v4) return isPrivateIpv4(v4[0], v4[1])

  // A bare integer host (`2130706433` = 127.0.0.1). `validateFetchTarget`
  // never sees one — WHATWG `URL` folds it to a dotted quad first — but this
  // function is exported and callable on its own, and a guard that is only
  // correct when reached through one particular caller is a guard waiting to
  // be misused.
  if (/^\d+$/.test(host)) {
    const n = Number(host)
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) {
      return isPrivateIpv4((n >>> 24) & 0xff, (n >>> 16) & 0xff)
    }
    return true
  }

  const v6 = parseIpv6(host)
  if (v6) return isPrivateIpv6(v6)

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
  // Embedded credentials are never needed to read a public product page, and
  // `http://public.example@127.0.0.1/` is the oldest trick for getting a human
  // (or a sloppy parser) to read the wrong half of a URL as the host.
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: 'URLs with credentials are not allowed' }
  }
  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, reason: 'That host is not allowed' }
  }
  return { ok: true, url: parsed.toString() }
}
