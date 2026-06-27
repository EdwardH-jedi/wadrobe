// Phase 3: product-metadata extraction from page HTML (the core deliverable).
import { describe, expect, it } from 'vitest'
import { parseProductMeta, toFinitePrice } from './productMetaParse'

const SRC = 'https://shop.example/p/123'

function ldScript(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`
}

describe('toFinitePrice', () => {
  it('accepts numbers and finite-only', () => {
    expect(toFinitePrice(129)).toBe(129)
    expect(toFinitePrice(Number.NaN)).toBeUndefined()
    expect(toFinitePrice(Infinity)).toBeUndefined()
  })

  it('parses messy strings to numbers', () => {
    expect(toFinitePrice('129.00')).toBe(129)
    expect(toFinitePrice('$129')).toBe(129)
    expect(toFinitePrice('1,299.00')).toBe(1299)
    expect(toFinitePrice('1.299,00')).toBe(1299) // EU formatting
    expect(toFinitePrice('USD 49,99')).toBe(49.99)
    expect(toFinitePrice('free')).toBeUndefined()
  })
})

describe('parseProductMeta — JSON-LD', () => {
  it('extracts name/brand/price/currency/image from a Product node', () => {
    const html = ldScript({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Wool Overcoat',
      brand: { '@type': 'Brand', name: 'Maison Grey' },
      image: 'https://img.example/coat.jpg',
      offers: { '@type': 'Offer', price: '320.00', priceCurrency: 'GBP' },
    })
    expect(parseProductMeta(html, SRC)).toEqual({
      name: 'Wool Overcoat',
      brand: 'Maison Grey',
      price: 320,
      currency: 'GBP',
      imageUrl: 'https://img.example/coat.jpg',
      sourceUrl: SRC,
    })
  })

  it('handles @type as an array and brand/image as plain strings', () => {
    const html = ldScript({
      '@type': ['Product', 'IndividualProduct'],
      name: 'Suede Derby',
      brand: 'Atelier No.6',
      image: ['https://img.example/a.jpg', 'https://img.example/b.jpg'],
      offers: [{ price: 240, priceCurrency: 'EUR' }],
    })
    const meta = parseProductMeta(html, SRC)
    expect(meta.name).toBe('Suede Derby')
    expect(meta.brand).toBe('Atelier No.6')
    expect(meta.imageUrl).toBe('https://img.example/a.jpg')
    expect(meta.price).toBe(240)
    expect(meta.currency).toBe('EUR')
  })

  it('finds the Product inside an @graph and ignores non-Product nodes', () => {
    const html = ldScript({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Shop' },
        {
          '@type': 'Product',
          name: 'Cargo Pants',
          image: { url: 'https://img.example/cargo.jpg' },
          offers: { lowPrice: '89.5', priceCurrency: 'USD' },
        },
      ],
    })
    const meta = parseProductMeta(html, SRC)
    expect(meta.name).toBe('Cargo Pants')
    expect(meta.imageUrl).toBe('https://img.example/cargo.jpg')
    expect(meta.price).toBe(89.5)
  })

  it('picks the Product block when several ld+json blocks exist', () => {
    const html =
      ldScript({ '@type': 'Organization', name: 'Shop Inc' }) +
      ldScript({ '@type': 'Product', name: 'Knit Beanie', brand: 'Northpoint' })
    const meta = parseProductMeta(html, SRC)
    expect(meta.name).toBe('Knit Beanie')
    expect(meta.brand).toBe('Northpoint')
  })

  it('skips a malformed JSON-LD block without throwing', () => {
    const html =
      '<script type="application/ld+json">{ not json,, }</script>' +
      ldScript({ '@type': 'Product', name: 'Linen Shirt' })
    expect(parseProductMeta(html, SRC).name).toBe('Linen Shirt')
  })
})

describe('parseProductMeta — OpenGraph fallback', () => {
  it('reads og:title/og:image/product:price when no JSON-LD is present', () => {
    const html = `
      <meta property="og:title" content="Racing Jacket &amp; Liner" />
      <meta property="og:image" content="https://img.example/jacket.jpg" />
      <meta property="product:price:amount" content="$199.95" />
      <meta property="product:price:currency" content="USD" />
      <meta property="product:brand" content="Form Studio" />
    `
    expect(parseProductMeta(html, SRC)).toEqual({
      name: 'Racing Jacket & Liner',
      brand: 'Form Studio',
      price: 199.95,
      currency: 'USD',
      imageUrl: 'https://img.example/jacket.jpg',
      sourceUrl: SRC,
    })
  })

  it('tolerates reversed attribute order (content before name)', () => {
    const html =
      '<meta content="Reversed Title" name="og:title">'
    expect(parseProductMeta(html, SRC).name).toBe('Reversed Title')
  })

  it('returns just the sourceUrl when nothing useful is found', () => {
    expect(parseProductMeta('<html><body>nope</body></html>', SRC)).toEqual({
      name: undefined,
      brand: undefined,
      price: undefined,
      currency: undefined,
      imageUrl: undefined,
      sourceUrl: SRC,
    })
  })
})
