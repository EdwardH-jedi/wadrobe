// Shared request guards for the optional Vercel serverless layer (Track A).
//
// NOT an endpoint: Vercel skips files and directories under `api/` whose name
// starts with `_`, so this module is bundled into the handlers that import it
// instead of being deployed as its own route.
//
// Like the handlers it serves, this file sits outside tsc/build/test — only
// eslint sees it (see the header of `api/analyze.ts`). Keep it dependency-free
// and Web-standard so it runs unchanged on the Edge runtime.
//
// It covers the three things every endpoint here needs before it spends money
// upstream: an origin allowlist (no wildcard CORS), a method check, and a
// coarse per-caller request throttle.

// --- CORS -------------------------------------------------------------------

const CORS_MAX_AGE_SECONDS = '600'

/** Normalize to `scheme://host[:port]`, or null when the input is unusable. */
function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

/** `ALLOWED_ORIGINS` is a comma-separated list; unparseable entries are dropped. */
function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const entry of raw.split(',')) {
    const origin = normalizeOrigin(entry)
    if (origin && !out.includes(origin)) out.push(origin)
  }
  return out
}

/**
 * The origin this function is being served from, used as the default allowlist
 * when `ALLOWED_ORIGINS` is unset. Behind Vercel's proxy the forwarded headers
 * carry the public host; `req.url` is the fallback.
 */
function selfOrigin(req: Request): string | null {
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim()
    const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim()
    const origin = normalizeOrigin(`${proto}://${host}`)
    if (origin) return origin
  }
  try {
    return new URL(req.url).origin
  } catch {
    return null
  }
}

type CorsDecision = { allowed: boolean; headers: Record<string, string> }

function resolveCors(req: Request): CorsDecision {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': CORS_MAX_AGE_SECONDS,
    // The allow-origin header is computed per request, so a shared cache must
    // not replay one origin's response to another.
    Vary: 'Origin',
  }

  const origin = req.headers.get('origin')
  if (!origin) {
    // No `Origin` header means this is not a browser cross-origin call: a
    // same-origin navigation-style request, curl, or server-to-server. There is
    // nothing to grant and nothing to deny — we emit no allow-origin header,
    // which is exactly "same-origin only" as far as any browser is concerned.
    return { allowed: true, headers }
  }

  const configured = parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
  // Unset env => same-origin only. Never a wildcard: with no auth in front of
  // these endpoints, `*` lets any page on the internet spend the project's
  // eBay and Anthropic quota.
  const allowlist = configured.length > 0 ? configured : [selfOrigin(req)]

  const normalized = normalizeOrigin(origin)
  if (!normalized || !allowlist.includes(normalized)) {
    return { allowed: false, headers }
  }
  // Echo the header as sent: the browser compares it byte-for-byte.
  return { allowed: true, headers: { ...headers, 'Access-Control-Allow-Origin': origin } }
}

// --- Throttling -------------------------------------------------------------

const WINDOW_MS = 60_000
const MAX_TRACKED_KEYS = 5000

export type RateLimitRule = {
  /** Endpoint name. Namespaces the counters so each route has its own budget. */
  name: string
  /** Requests allowed per caller per minute, unless RATE_LIMIT_PER_MINUTE overrides it. */
  max: number
}

type Bucket = { count: number; resetAt: number }

// IMPORTANT — this is a speed bump, not a guarantee.
//
// These counters live in module scope, which on Vercel means per *isolate*.
// Serverless scales horizontally and recycles isolates freely, so the effective
// ceiling is roughly (limit x number of live isolates), and a cold start resets
// a caller's window to zero. It reliably stops one client hammering one warm
// isolate in a loop — the case that actually drains an API quota — and nothing
// stronger than that.
//
// Enforcing a real global limit needs shared state (Vercel WAF rate-limiting
// rules, or a Redis/Upstash counter). That is deliberately not built here: it
// would add infrastructure and a dependency for an optional, off-by-default
// layer. Reach for it if these endpoints are ever exposed to untrusted traffic
// at scale.
const buckets = new Map<string, Bucket>()

function callerKey(req: Request): string {
  const forwarded =
    req.headers.get('x-forwarded-for') || req.headers.get('x-vercel-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip')?.trim()
  // No usable client address: bucket all such callers together. That is
  // stricter than letting them through unmetered, which is the safe direction.
  return ip || 'unknown'
}

function resolveMax(rule: RateLimitRule): number {
  const override = Number(process.env.RATE_LIMIT_PER_MINUTE)
  return Number.isFinite(override) && override > 0 ? Math.floor(override) : rule.max
}

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  // Still oversized after dropping expired windows means a burst of distinct
  // callers. Drop everything rather than grow without bound; the worst case is
  // that in-flight windows restart early.
  if (buckets.size > MAX_TRACKED_KEYS) buckets.clear()
}

type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

function checkRateLimit(req: Request, rule: RateLimitRule): RateLimitResult {
  const now = Date.now()
  const key = `${rule.name}:${callerKey(req)}`
  if (buckets.size > MAX_TRACKED_KEYS) sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true }
  }
  if (bucket.count >= resolveMax(rule)) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }
  bucket.count += 1
  return { ok: true }
}

// --- Entry point ------------------------------------------------------------

export function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

// --- Deployment kill switch -------------------------------------------------

/**
 * These routes are OPTIONAL PROTOTYPES. They have no authentication, and two of
 * them spend a paid API key per call. Deploying the repository must therefore
 * not, by itself, put them on the public internet — so they are **off unless
 * explicitly enabled**.
 *
 * Set `ENABLE_OPTIONAL_APIS=true` in the deployment environment to turn them on,
 * and set `ALLOWED_ORIGINS` at the same time. With the flag unset every route
 * answers 404: indistinguishable from "not deployed", which is the correct
 * amount of information to give an unauthenticated caller.
 */
export function optionalApisEnabled(): boolean {
  const raw = process.env.ENABLE_OPTIONAL_APIS
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'true'
}

// --- Bounded response reading -----------------------------------------------

/**
 * Read a response body as text, refusing to buffer more than `maxBytes`.
 *
 * `await res.text()` buffers the WHOLE body before anything can truncate it, so
 * a hostile or merely broken upstream can exhaust memory no matter what cap is
 * applied afterwards. This streams instead and stops at the cap, so the ceiling
 * is enforced on what is actually held in memory.
 *
 * Returns `null` when the cap is exceeded, so the caller can reject rather than
 * silently parse a half-document.
 *
 * Structurally typed rather than `Response`-typed so the same cap applies to an
 * INBOUND `Request` body. These routes are unauthenticated: without it, anyone
 * who can reach `/api/analyze` can make the function buffer an arbitrary number
 * of megabytes before a single line of the handler's own validation runs.
 */
export interface CappedBody {
  headers: Headers
  body: ReadableStream<Uint8Array> | null
  text(): Promise<string>
}

export async function readCappedText(
  res: CappedBody,
  maxBytes: number,
): Promise<string | null> {
  // Cheap pre-check: an honest upstream announces an oversized body up front.
  const declared = Number(res.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) return null

  const body = res.body
  if (!body) {
    // No stream available (some runtimes/mocks): fall back to text() but only
    // after the content-length check above, and re-check the result.
    const text = await res.text()
    return text.length > maxBytes ? null : text
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(decoder.decode(value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return chunks.join('')
  } finally {
    reader.releaseLock?.()
  }
}

export type RequestGate =
  /** Respond with this and stop: preflight, bad method, blocked origin, throttled. */
  | { ok: false; response: Response }
  /** Proceed. Spread `cors` into the headers of every response the handler builds. */
  | { ok: true; cors: Record<string, string> }

/**
 * Run every cheap check before the handler touches a paid upstream: origin
 * allowlist first (so a disallowed caller costs nothing), then the preflight
 * reply, the method check, and finally the throttle. Preflights are not
 * throttled — they carry no body and would otherwise eat a caller's budget.
 */
export function gateRequest(req: Request, rule: RateLimitRule): RequestGate {
  const cors = resolveCors(req)
  if (!cors.allowed) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Origin not allowed' }, 403, cors.headers),
    }
  }
  if (req.method === 'OPTIONS') {
    return { ok: false, response: new Response(null, { status: 204, headers: cors.headers }) }
  }
  if (req.method !== 'POST') {
    return {
      ok: false,
      response: jsonResponse({ error: 'Method not allowed' }, 405, cors.headers),
    }
  }

  const limit = checkRateLimit(req, rule)
  if (!limit.ok) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Too many requests' }, 429, {
        ...cors.headers,
        'Retry-After': String(limit.retryAfterSeconds),
      }),
    }
  }
  return { ok: true, cors: cors.headers }
}

/**
 * Read and parse a capped JSON request body.
 *
 * Every route here is unauthenticated, so the size limit has to come BEFORE
 * `req.json()` — which buffers the whole body first and would make the cap
 * decorative. Distinguishes "too large" from "not JSON" so the caller can
 * answer 413 vs 400 rather than collapsing both into one unhelpful error.
 */
export async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<
  { ok: true; value: unknown } | { ok: false; reason: 'too-large' | 'invalid' }
> {
  const raw = await readCappedText(req, maxBytes).catch(() => null)
  if (raw === null) return { ok: false, reason: 'too-large' }
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

/** Body cap for the routes whose payload is a short JSON object (a URL, a query). */
export const SMALL_BODY_BYTES = 16_000

/**
 * Body cap for `/api/analyze`, whose payload is a base64 thumbnail. A 768px
 * JPEG at the app's quality setting is ~150 kB before base64's 4/3 inflation,
 * so this is roughly ten times the largest legitimate request.
 */
export const IMAGE_BODY_BYTES = 2_000_000
