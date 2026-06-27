// Pure product-metadata extraction (Phase 3).
//
// Given a product page's raw HTML, read the page's OWN declared metadata:
// schema.org `Product` JSON-LD first, then OpenGraph/meta tags as a fallback.
// There is NO network here (the `/api/product-meta` handler does the fetch) and
// NO recognition — this only reads what the page already states, and the user
// confirms every field before saving. Deterministic + unit-tested.

export interface ProductMeta {
  name?: string
  brand?: string
  price?: number
  currency?: string
  imageUrl?: string
  /** Echoed back so callers can store the source link. */
  sourceUrl: string
}

// --- price -----------------------------------------------------------------

/** Coerce a JSON-LD / meta price (number or messy string) to a finite number. */
export function toFinitePrice(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  let s = value.replace(/[^\d.,]/g, '')
  if (!s) return undefined
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot !== -1 && lastComma !== -1) {
    // Both separators present: the later one is the decimal point.
    if (lastDot > lastComma) {
      s = s.replace(/,/g, '')
    } else {
      s = s.replace(/\./g, '').replace(',', '.')
    }
  } else if (lastComma !== -1) {
    // Only commas: decimal if 1–2 trailing digits, else a thousands separator.
    const trailing = s.length - lastComma - 1
    s = trailing <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : undefined
}

// --- JSON-LD ---------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1].trim()))
    } catch {
      // Ignore a malformed JSON-LD block; keep scanning the rest.
    }
  }
  return blocks
}

function* iterateNodes(data: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(data)) {
    for (const item of data) yield* iterateNodes(item)
  } else if (isRecord(data)) {
    yield data
    const graph = data['@graph']
    if (Array.isArray(graph)) {
      for (const item of graph) yield* iterateNodes(item)
    }
  }
}

function isProductNode(node: Record<string, unknown>): boolean {
  const t = node['@type']
  if (typeof t === 'string') return t.toLowerCase() === 'product'
  if (Array.isArray(t)) {
    return t.some((x) => typeof x === 'string' && x.toLowerCase() === 'product')
  }
  return false
}

function readBrand(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (Array.isArray(value)) return readBrand(value[0])
  if (isRecord(value) && typeof value.name === 'string') {
    return value.name.trim() || undefined
  }
  return undefined
}

function readImage(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (Array.isArray(value)) return readImage(value[0])
  if (isRecord(value) && typeof value.url === 'string') {
    return value.url.trim() || undefined
  }
  return undefined
}

function readOffers(value: unknown): { price?: number; currency?: string } {
  const offer = Array.isArray(value) ? value[0] : value
  if (!isRecord(offer)) return {}
  const price = toFinitePrice(offer.price ?? offer.lowPrice)
  const currency =
    typeof offer.priceCurrency === 'string' ? offer.priceCurrency : undefined
  return { price, currency }
}

function fromProductNode(
  node: Record<string, unknown>,
  sourceUrl: string,
): ProductMeta {
  const { price, currency } = readOffers(node.offers)
  return {
    name: typeof node.name === 'string' ? node.name.trim() || undefined : undefined,
    brand: readBrand(node.brand),
    price,
    currency,
    imageUrl: readImage(node.image),
    sourceUrl,
  }
}

// --- OpenGraph / meta fallback ---------------------------------------------

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Read a `<meta>` content by property/name key, tolerating attribute order. */
function readMetaTag(html: string, key: string): string | undefined {
  const k = escapeRegex(key)
  const patterns = [
    new RegExp(
      `<meta[^>]*(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`,
      'i',
    ),
  ]
  for (const re of patterns) {
    const m = re.exec(html)
    if (m && m[1].trim()) return decodeEntities(m[1])
  }
  return undefined
}

function hasMeaningfulMeta(meta: ProductMeta): boolean {
  return Boolean(meta.name || meta.brand || meta.imageUrl || meta.price !== undefined)
}

/**
 * Extract a `ProductMeta` from a product page's HTML. Tries schema.org `Product`
 * JSON-LD (incl. `@graph` and `@type` arrays), then OpenGraph/meta. Returns a
 * record carrying only `sourceUrl` when nothing useful is found.
 */
export function parseProductMeta(html: string, sourceUrl: string): ProductMeta {
  for (const block of extractJsonLdBlocks(html)) {
    for (const node of iterateNodes(block)) {
      if (isProductNode(node)) {
        const meta = fromProductNode(node, sourceUrl)
        if (hasMeaningfulMeta(meta)) return meta
      }
    }
  }

  const og: ProductMeta = {
    name: readMetaTag(html, 'og:title'),
    brand: readMetaTag(html, 'product:brand') ?? readMetaTag(html, 'og:brand'),
    price: toFinitePrice(readMetaTag(html, 'product:price:amount')),
    currency: readMetaTag(html, 'product:price:currency'),
    imageUrl: readMetaTag(html, 'og:image'),
    sourceUrl,
  }
  return og
}
