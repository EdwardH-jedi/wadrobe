// Golden-fixture conformance suite.
//
// These assertions are the CONTRACT between this web client and any other
// implementation of the format (the immediate case being an iOS client). The
// fixtures in `__fixtures__/archive-export/` are committed files, not generated
// ones, so both sides can read the same bytes and compare behaviour. If an
// implementation disagrees with one of these expectations, one of the two is
// wrong — see `__fixtures__/archive-export/README.md`.
//
// Every expectation here traces to a rule in docs/ARCHIVE_EXPORT_SCHEMA.md.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GarmentItem } from '../../domain/garmentTypes'
import { reviewArchiveImportText, type ArchiveImportIssue } from './archiveImport'

// Resolved from the project root (vitest's cwd) rather than `import.meta.url`:
// Vite rewrites the latter to a root-relative browser path, which `fs` cannot
// open. Read as raw text, never `import`ed — one fixture is deliberately not
// valid JSON.
const FIXTURE_DIR = join(
  process.cwd(),
  'src/lib/storage/__fixtures__/archive-export',
)

function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8')
}

const review = (name: string) => reviewArchiveImportText(fixture(name))
const codes = (issues: ArchiveImportIssue[]) => issues.map((i) => i.code)
const countCode = (issues: ArchiveImportIssue[], code: string) =>
  issues.filter((i) => i.code === code).length
const ids = (garments: GarmentItem[]) => garments.map((g) => g.id)

// --- Valid documents --------------------------------------------------------

describe('minimal-valid.json', () => {
  it('imports one garment from the smallest legal document', () => {
    const r = review('minimal-valid.json')

    expect(r.ok).toBe(true)
    expect(ids(r.garments)).toEqual(['grm-minimal-1'])
    expect(r.issues).toEqual([])
  })

  it('treats the absent optional envelope fields as their defaults (§3)', () => {
    const r = review('minimal-valid.json')

    // No assetEncoding, exportedAt, savedOutfits or currentOutfit in the file.
    expect(r.exportedAt).toBeNull()
    expect(r.savedOutfits).toEqual([])
    expect(r.currentOutfit).toEqual({
      outerwear: null,
      top: null,
      pants: null,
      shoes: null,
      accessory: null,
    })
  })
})

describe('empty-archive.json', () => {
  it('is a legal document, not an error — an empty wardrobe backs up fine', () => {
    const r = review('empty-archive.json')

    expect(r.ok).toBe(true)
    expect(r.garments).toEqual([])
    expect(r.savedOutfits).toEqual([])
    expect(r.issues).toEqual([])
    expect(r.exportedAt).toBe(1753577000000)
  })
})

describe('full-featured.json', () => {
  const r = review('full-featured.json')

  it('imports every record with no issues', () => {
    expect(r.ok).toBe(true)
    expect(r.garments).toHaveLength(5)
    expect(r.savedOutfits).toHaveLength(2)
    expect(r.issues).toEqual([])
  })

  it('preserves every optional garment field', () => {
    const g = r.garments[0]

    expect(g).toMatchObject({
      id: 'grm-full-outerwear',
      brand: 'Unbranded',
      notes: expect.stringContaining('Shibuya'),
      material: 'Nylon',
      size: 'M',
      price: 340,
      currency: 'USD',
      subtype: 'bomber',
      purchasedAt: 1690000000000,
      retailer: 'Berg & Sons',
      analysisConfidence: 0.82,
      analysisSource: 'mock',
      userEdited: true,
    })
    expect(g.styleTags).toEqual(['street', 'layering', 'archive'])
  })

  it('keeps the full market-value history, including a currency-less entry', () => {
    expect(r.garments[0].marketValueHistory).toEqual([
      { id: 'mv-1', at: 1700000000000, value: 300, currency: 'USD' },
      { id: 'mv-2', at: 1740000000000, value: 365, currency: 'USD' },
      { id: 'mv-3', at: 1753000000000, value: 410 },
    ])
  })

  it('keeps the whole asset bundle and the proxy 3d link', () => {
    expect(r.garments[0].asset).toMatchObject({
      assetMode: 'cutout',
      thumbnailImageUrl: expect.any(String),
      croppedImageUrl: expect.any(String),
      cutoutImageUrl: expect.any(String),
      productReferenceImageUrl: expect.any(String),
      sourceUrl: expect.any(String),
      sourceLabel: 'Vintage racing jacket reference',
    })
    expect(r.garments[0].proxy3dPreview).toMatchObject({
      jobId: 'job-9f2c41',
      mode: 'dual-sided',
      vertexCount: 4820,
      faceCount: 9216,
    })
  })

  it('does not let a stored cutout shadow a chosen product reference (§6.3.1)', () => {
    const knit = r.garments.find((g) => g.id === 'grm-full-top')!

    expect(knit.asset?.assetMode).toBe('product-reference')
    // A cutout url is also present, but displayImageUrl outranks it.
    expect(knit.asset?.cutoutImageUrl).toBeDefined()
    expect(knit.asset?.displayImageUrl).toBe(
      'https://example.invalid/reference/knit.jpg',
    )
  })

  it('accepts a zero price as a real value, not a missing one', () => {
    const watch = r.garments.find((g) => g.id === 'grm-full-accessory')!

    expect(watch.price).toBe(0)
    expect(watch).toHaveProperty('price')
  })
})

describe('legacy-records.json', () => {
  const r = review('legacy-records.json')

  it('imports pre-asset-pipeline records untouched', () => {
    expect(r.ok).toBe(true)
    expect(r.garments).toHaveLength(3)
    expect(r.issues).toEqual([])
    expect(r.garments[0].asset).toBeUndefined()
    expect(r.garments[1].asset).toBeUndefined()
  })

  it('carries percent-encoded data urls through intact (§5.1)', () => {
    // The sample wardrobe ships as percent-encoded SVG, NOT base64. A decoder
    // that only handles ";base64," breaks on exactly this file.
    for (const g of r.garments) {
      expect(g.imageDataUrl.startsWith('data:image/svg+xml,%3Csvg')).toBe(true)
      expect(g.imageDataUrl).not.toContain(';base64,')
    }
  })
})

describe('blob-backed-inlined.json', () => {
  const r = review('blob-backed-inlined.json')

  it('imports cleanly — a conforming export carries bytes, never keys', () => {
    expect(r.ok).toBe(true)
    expect(r.garments).toHaveLength(3)
    expect(r.issues).toEqual([])
  })

  it('has no blob ref anywhere and every image inline', () => {
    for (const g of r.garments) {
      expect(g.asset?.croppedImageRef).toBeUndefined()
      expect(g.asset?.cutoutImageRef).toBeUndefined()
      expect(g.asset?.displayImageUrl.startsWith('data:')).toBe(true)
    }
    expect(fixture('blob-backed-inlined.json')).not.toContain('indexeddb-blob')
  })

  it('keeps a piece whose blob was lost at export time, on its thumbnail', () => {
    const lost = r.garments.find((g) => g.id === 'grm-blob-unresolved')!

    expect(lost.asset?.assetMode).toBe('cutout')
    expect(lost.asset?.cutoutImageUrl).toBeUndefined()
    // Degraded to the thumbnail rather than dropped.
    expect(lost.asset?.displayImageUrl).toBe(lost.imageDataUrl)
  })
})

describe('blob-ref-leaked.json (non-conforming input)', () => {
  const r = review('blob-ref-leaked.json')

  it('keeps every piece and reports what it stripped', () => {
    expect(r.ok).toBe(true)
    expect(r.garments).toHaveLength(3)
    expect(countCode(r.issues, 'foreign-blob-ref')).toBe(2)
    expect(countCode(r.issues, 'process-local-url')).toBe(1)
    expect(countCode(r.issues, 'invalid-shape')).toBe(0)
  })

  it('leaves no unresolvable pointer behind', () => {
    for (const g of r.garments) {
      expect(g.asset?.croppedImageRef).toBeUndefined()
      expect(g.asset?.cutoutImageRef).toBeUndefined()
      expect(JSON.stringify(g)).not.toContain('blob:')
    }
  })

  it('falls back down the display chain when the dead url was the display one', () => {
    const stripped = r.garments.find((g) => g.id === 'grm-leaked-object-url')!

    expect(stripped.asset?.displayImageUrl).toBe('')
    // Blank, so the chain terminates at the thumbnail — never a broken image.
    expect(stripped.imageDataUrl.startsWith('data:')).toBe(true)
  })
})

describe('unrecognized-enums.json', () => {
  const r = review('unrecognized-enums.json')

  it('drops ONLY the unknown-category piece (§6.4)', () => {
    expect(r.ok).toBe(true)
    expect(ids(r.garments)).toEqual([
      'grm-enum-unknown-analysis-source',
      'grm-enum-unknown-asset-mode',
      'grm-enum-unknown-proxy3d-mode',
      'grm-enum-unknown-ref-kind',
    ])
    expect(countCode(r.issues, 'invalid-shape')).toBe(1)
  })

  it('drops an unrecognized analysisSource but keeps the garment', () => {
    const g = r.garments.find((x) => x.id === 'grm-enum-unknown-analysis-source')!

    expect(g).not.toHaveProperty('analysisSource')
    expect(g.analysisConfidence).toBe(0.9) // sibling fields untouched
  })

  it('keeps an unrecognized assetMode rather than dropping the asset', () => {
    const g = r.garments.find((x) => x.id === 'grm-enum-unknown-asset-mode')!

    expect(g.asset?.assetMode).toBe('holo-scan')
    expect(g.asset?.displayImageUrl).toBe('data:image/webp;base64,ZGlzcGxheS1ieXRlcw==')
  })

  it('drops the whole proxy3dPreview on an unrecognized mode', () => {
    const g = r.garments.find((x) => x.id === 'grm-enum-unknown-proxy3d-mode')!

    expect(g.proxy3dPreview).toBeUndefined()
  })

  it('strips a ref of an unrecognized kind too — all refs are foreign (§9.4)', () => {
    const g = r.garments.find((x) => x.id === 'grm-enum-unknown-ref-kind')!

    expect(g.asset?.cutoutImageRef).toBeUndefined()
    expect(countCode(r.issues, 'foreign-blob-ref')).toBe(1)
  })

  it('ignores unknown keys and preserves them on the record (§8.4)', () => {
    const g = r.garments.find((x) => x.id === 'grm-enum-unknown-asset-mode')!

    expect(g).toHaveProperty('fabricWeightGsm', 380)
    expect(g.asset).toHaveProperty('futureAssetField')
  })

  it('warns that a look points at the dropped piece', () => {
    expect(countCode(r.issues, 'unknown-garment-reference')).toBe(1)
  })
})

// --- Malformed documents ----------------------------------------------------

describe('document-level rejection (§3.1)', () => {
  it.each([
    ['malformed-not-json.json', 'not-json'],
    ['malformed-root-array.json', 'not-an-object'],
    ['malformed-wrong-kind.json', 'wrong-kind'],
    ['malformed-missing-schema-version.json', 'unsupported-schema-version'],
    ['malformed-future-schema-version.json', 'unsupported-schema-version'],
    ['malformed-missing-garments.json', 'missing-garments'],
  ])('%s is rejected with %s and imports nothing', (name, code) => {
    const r = review(name)

    expect(r.ok).toBe(false)
    expect(codes(r.issues)).toEqual([code])
    expect(r.garments).toEqual([])
    expect(r.savedOutfits).toEqual([])
  })

  it('a future schema version is refused outright, not partially imported', () => {
    // §9.3: a best-effort partial import of a newer version could silently
    // discard records this build cannot represent.
    const r = review('malformed-future-schema-version.json')

    expect(r.garments).toEqual([])
    expect(r.issues[0].message).toContain('99')
  })
})

describe('malformed-garment-entries.json', () => {
  const r = review('malformed-garment-entries.json')

  it('imports the survivors and drops the rest, document still ok', () => {
    expect(r.ok).toBe(true)
    expect(ids(r.garments)).toEqual(['grm-ok-1', 'grm-ok-2'])
  })

  it('reports one issue per dropped entry — nothing vanishes silently (§8)', () => {
    expect(countCode(r.issues, 'invalid-shape')).toBe(11)
    expect(countCode(r.issues, 'duplicate-id')).toBe(1)
    expect(r.issues).toHaveLength(12)
  })

  it('keeps the FIRST record on a duplicate id (§6.5)', () => {
    expect(r.garments[0].name).toBe('Survivor One')
    expect(r.garments[0].category).toBe('top')
  })

  it('names each dropped entry so a user can act on the report', () => {
    const dropped = r.issues.filter((i) => i.severity === 'dropped')

    expect(dropped.every((i) => i.message.length > 0)).toBe(true)
    expect(r.issues.some((i) => i.message.includes('Non-String Style Tag'))).toBe(true)
    expect(r.issues.some((i) => i.message.includes('entry #2'))).toBe(true)
  })
})

describe('malformed-outfits.json', () => {
  const r = review('malformed-outfits.json')

  it('drops malformed looks but keeps the good ones', () => {
    expect(r.ok).toBe(true)
    expect(r.savedOutfits.map((o) => o.id)).toEqual([
      'look-ok',
      'look-dangling-reference',
      'look-nonstring-slots',
    ])
    expect(countCode(r.issues, 'invalid-shape')).toBe(4) // 3 looks + current outfit
    expect(countCode(r.issues, 'duplicate-id')).toBe(1)
  })

  it('warns about dangling garment references without dropping the look (§7.1)', () => {
    const dangling = r.savedOutfits.find((o) => o.id === 'look-dangling-reference')!

    expect(dangling.selection.outerwear).toBe('grm-does-not-exist')
    expect(countCode(r.issues, 'unknown-garment-reference')).toBe(1)
  })

  it('normalizes non-string slot values to null', () => {
    const odd = r.savedOutfits.find((o) => o.id === 'look-nonstring-slots')!

    expect(odd.selection).toEqual({
      outerwear: null,
      top: null,
      pants: null,
      shoes: null,
      accessory: null,
    })
  })

  it('imports a malformed current outfit as an empty rail, with a warning', () => {
    expect(r.currentOutfit).toEqual({
      outerwear: null,
      top: null,
      pants: null,
      shoes: null,
      accessory: null,
    })
    expect(
      r.issues.some(
        (i) => i.scope === 'current-outfit' && i.severity === 'warning',
      ),
    ).toBe(true)
  })
})

describe('malformed-saved-outfits-not-a-list.json', () => {
  it('imports the garments and reports the looks it could not read', () => {
    const r = review('malformed-saved-outfits-not-a-list.json')

    expect(r.ok).toBe(true)
    expect(ids(r.garments)).toEqual(['grm-survives-1'])
    expect(r.savedOutfits).toEqual([])
    expect(codes(r.issues)).toContain('invalid-shape')
    expect(r.issues[0].scope).toBe('saved-outfit')
  })
})

// --- Cross-cutting ----------------------------------------------------------

describe('every fixture', () => {
  const ALL = [
    'minimal-valid.json',
    'empty-archive.json',
    'full-featured.json',
    'legacy-records.json',
    'blob-backed-inlined.json',
    'blob-ref-leaked.json',
    'unrecognized-enums.json',
    'malformed-not-json.json',
    'malformed-root-array.json',
    'malformed-wrong-kind.json',
    'malformed-missing-schema-version.json',
    'malformed-future-schema-version.json',
    'malformed-missing-garments.json',
    'malformed-garment-entries.json',
    'malformed-outfits.json',
    'malformed-saved-outfits-not-a-list.json',
  ]

  it.each(ALL)('%s is reviewed without throwing', (name) => {
    expect(() => review(name)).not.toThrow()
  })

  it.each(ALL)('%s yields a complete five-slot current outfit', (name) => {
    const r = review(name)

    expect(Object.keys(r.currentOutfit).sort()).toEqual([
      'accessory',
      'outerwear',
      'pants',
      'shoes',
      'top',
    ])
  })

  it.each(ALL)('%s reports a message for every issue it raises', (name) => {
    for (const issue of review(name).issues) {
      expect(issue.message.length).toBeGreaterThan(0)
      expect(issue.code.length).toBeGreaterThan(0)
      expect(['dropped', 'warning']).toContain(issue.severity)
    }
  })
})
