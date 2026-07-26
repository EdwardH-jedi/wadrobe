import { describe, expect, it } from 'vitest'
import { makeGarment } from '../../test/factories'
import { createEmptyOutfit, type SavedOutfit } from '../../domain/outfitTypes'
import {
  ARCHIVE_EXPORT_ASSET_ENCODING,
  ARCHIVE_EXPORT_KIND,
  ARCHIVE_EXPORT_SCHEMA_VERSION,
} from './archiveExport'
import {
  reviewArchiveImport,
  reviewArchiveImportText,
  summarizeArchiveImport,
  type ArchiveImportIssue,
} from './archiveImport'

/** A minimal well-formed document; `over` replaces any top-level field. */
function doc(over: Record<string, unknown> = {}) {
  return {
    kind: ARCHIVE_EXPORT_KIND,
    schemaVersion: ARCHIVE_EXPORT_SCHEMA_VERSION,
    assetEncoding: ARCHIVE_EXPORT_ASSET_ENCODING,
    exportedAt: 1_700_000_000_000,
    garments: [],
    savedOutfits: [],
    currentOutfit: createEmptyOutfit(),
    ...over,
  }
}

const savedOutfit = (over: Partial<SavedOutfit> = {}): SavedOutfit => ({
  id: 'look-1',
  name: 'Sunday',
  selection: createEmptyOutfit(),
  createdAt: 1_699_000_000_000,
  coverHex: '#2b2b30',
  ...over,
})

const codes = (issues: ArchiveImportIssue[]) => issues.map((i) => i.code)

describe('document-level rejection', () => {
  it('rejects JSON that is not an object', () => {
    const review = reviewArchiveImport([1, 2, 3])
    expect(review.ok).toBe(false)
    expect(codes(review.issues)).toEqual(['not-an-object'])
    expect(review.garments).toEqual([])
  })

  it('rejects an unrelated JSON document by kind', () => {
    const review = reviewArchiveImport({ garments: [makeGarment()] })
    expect(review.ok).toBe(false)
    expect(codes(review.issues)).toEqual(['wrong-kind'])
    // Nothing is carried out of a document we do not trust.
    expect(review.garments).toEqual([])
  })

  it('refuses a schema version newer than this build reads', () => {
    const review = reviewArchiveImport(doc({ schemaVersion: 99 }))
    expect(review.ok).toBe(false)
    expect(codes(review.issues)).toEqual(['unsupported-schema-version'])
    expect(review.issues[0].message).toContain('99')
  })

  it('refuses a document with no usable schema version', () => {
    expect(reviewArchiveImport(doc({ schemaVersion: 'one' })).ok).toBe(false)
    expect(reviewArchiveImport(doc({ schemaVersion: undefined })).ok).toBe(false)
  })

  it('refuses a document with no garments list', () => {
    const review = reviewArchiveImport(doc({ garments: undefined }))
    expect(review.ok).toBe(false)
    expect(codes(review.issues)).toEqual(['missing-garments'])
  })

  it('reports malformed JSON text rather than throwing', () => {
    const review = reviewArchiveImportText('{ not json')
    expect(review.ok).toBe(false)
    expect(codes(review.issues)).toEqual(['not-json'])
  })

  it('accepts a well-formed empty archive', () => {
    const review = reviewArchiveImport(doc())
    expect(review.ok).toBe(true)
    expect(review.issues).toEqual([])
    expect(review.schemaVersion).toBe(ARCHIVE_EXPORT_SCHEMA_VERSION)
    expect(review.exportedAt).toBe(1_700_000_000_000)
  })
})

describe('garment drops are reported, not silent', () => {
  it('drops an entry that fails the storage validator and names it', () => {
    const good = makeGarment({ id: 'grm-good', name: 'Wool Overcoat' })
    const review = reviewArchiveImport(
      doc({
        garments: [
          good,
          { name: 'Half A Piece' }, // no id/category/timestamps
          { ...makeGarment(), category: 'hat' }, // unknown category
          'not-an-object',
        ],
      }),
    )

    expect(review.ok).toBe(true)
    expect(review.garments).toEqual([good])
    expect(codes(review.issues)).toEqual([
      'invalid-shape',
      'invalid-shape',
      'invalid-shape',
    ])
    expect(review.issues[0].severity).toBe('dropped')
    expect(review.issues[0].message).toContain('"Half A Piece"')
    // Positional fallback when there is no name to quote.
    expect(review.issues[2].message).toContain('entry #4')
  })

  it('drops a repeated id inside the same file, keeping the first copy', () => {
    const first = makeGarment({ id: 'grm-dup', name: 'First' })
    const second = makeGarment({ id: 'grm-dup', name: 'Second' })
    const review = reviewArchiveImport(doc({ garments: [first, second] }))

    expect(review.garments).toEqual([first])
    expect(codes(review.issues)).toEqual(['duplicate-id'])
    expect(review.issues[0].message).toContain('Second')
  })

  it('keeps a garment whose optional fields were sanitized by the parser', () => {
    // storageTypes drops a malformed optional rather than the whole record.
    const review = reviewArchiveImport(
      doc({
        garments: [
          { ...makeGarment({ name: 'Repairable' }), price: 'free', size: 42 },
        ],
      }),
    )
    expect(review.garments).toHaveLength(1)
    expect(review.garments[0].name).toBe('Repairable')
    expect(review.garments[0].price).toBeUndefined()
    expect(review.garments[0].size).toBeUndefined()
  })

  it('strips a blob ref that points into another browser profile', () => {
    const review = reviewArchiveImport(
      doc({
        garments: [
          makeGarment({
            name: 'Hand-edited',
            asset: {
              originalImageUrl: 'data:image/png;base64,dGh1bWI=',
              displayImageUrl: 'data:image/png;base64,dGh1bWI=',
              assetMode: 'cutout',
              cutoutImageRef: { kind: 'indexeddb-blob', key: 'asset_1_foreign' },
            },
          }),
        ],
      }),
    )

    expect(review.garments).toHaveLength(1)
    expect(review.garments[0].asset?.cutoutImageRef).toBeUndefined()
    expect(review.garments[0].asset?.displayImageUrl).toBe(
      'data:image/png;base64,dGh1bWI=',
    )
    expect(codes(review.issues)).toEqual(['foreign-blob-ref'])
    expect(review.issues[0].severity).toBe('warning')
  })
})

// docs/ARCHIVE_EXPORT_SCHEMA.md §6.3 / §8.3: a malformed OPTIONAL field costs
// the user the field, never the garment. These are the cases the storage
// validator did not previously cover.
describe('a malformed optional field never costs a garment', () => {
  it.each([
    ['a string asset', 'banana'],
    ['a numeric asset', 42],
    ['an array asset', [{ displayImageUrl: 'data:image/png,x' }]],
    ['a null asset', null],
  ])('drops %s and keeps the piece rendering from its thumbnail', (_label, asset) => {
    const review = reviewArchiveImport(
      doc({ garments: [{ ...makeGarment({ name: 'Bomber' }), asset }] }),
    )

    expect(review.ok).toBe(true)
    expect(review.garments).toHaveLength(1)
    expect(review.garments[0].asset).toBeUndefined()
    expect(review.garments[0].imageDataUrl).toBe('data:image/svg+xml,<svg/>')
    expect(codes(review.issues)).not.toContain('invalid-shape')
  })

  it('keeps a well-shaped asset untouched', () => {
    const asset = {
      originalImageUrl: 'data:image/png,orig',
      displayImageUrl: 'data:image/png,shown',
      assetMode: 'cropped' as const,
    }
    const review = reviewArchiveImport(doc({ garments: [makeGarment({ asset })] }))

    expect(review.garments[0].asset).toEqual(asset)
  })

  it('tolerates an asset missing its required urls rather than dropping it', () => {
    // Producer obligation, not consumer: the display chain falls through to
    // imageDataUrl on its own, so there is nothing to drop.
    const review = reviewArchiveImport(
      doc({ garments: [{ ...makeGarment(), asset: { assetMode: 'cutout' } }] }),
    )

    expect(review.garments).toHaveLength(1)
    expect(review.garments[0].asset).toEqual({ assetMode: 'cutout' })
  })

  it('keeps a garment carrying an unrecognized assetMode', () => {
    const review = reviewArchiveImport(
      doc({
        garments: [
          {
            ...makeGarment(),
            asset: { originalImageUrl: 'x', displayImageUrl: 'x', assetMode: 'holo-scan' },
          },
        ],
      }),
    )

    expect(review.garments).toHaveLength(1)
    expect(codes(review.issues)).toHaveLength(0)
  })

  it.each(['brand', 'notes'])(
    'drops a wrong-typed %s and keeps the piece',
    (field) => {
      const review = reviewArchiveImport(
        doc({ garments: [{ ...makeGarment(), [field]: 12345 }] }),
      )

      expect(review.garments).toHaveLength(1)
      expect(review.garments[0]).not.toHaveProperty(field)
    },
  )
})

describe('saved outfit and current outfit handling', () => {
  it('drops malformed looks and reports each one', () => {
    const good = savedOutfit({ id: 'look-ok', name: 'Sunday' })
    const review = reviewArchiveImport(
      doc({
        garments: [],
        savedOutfits: [good, { id: 'look-bad', name: 'Broken' }, 7],
      }),
    )
    expect(review.savedOutfits).toEqual([good])
    expect(codes(review.issues)).toEqual(['invalid-shape', 'invalid-shape'])
    expect(review.issues[0].message).toContain('"Broken"')
  })

  it('drops a repeated look id', () => {
    const review = reviewArchiveImport(
      doc({
        savedOutfits: [
          savedOutfit({ id: 'look-dup', name: 'A' }),
          savedOutfit({ id: 'look-dup', name: 'B' }),
        ],
      }),
    )
    expect(review.savedOutfits).toHaveLength(1)
    expect(codes(review.issues)).toEqual(['duplicate-id'])
  })

  it('reports a savedOutfits field that is not a list, without failing the import', () => {
    const review = reviewArchiveImport(
      doc({ garments: [makeGarment()], savedOutfits: 'nope' }),
    )
    expect(review.ok).toBe(true)
    expect(review.garments).toHaveLength(1)
    expect(review.savedOutfits).toEqual([])
    expect(codes(review.issues)).toEqual(['invalid-shape'])
  })

  it('warns when a look references pieces the file does not contain', () => {
    const review = reviewArchiveImport(
      doc({
        garments: [],
        savedOutfits: [
          savedOutfit({
            selection: { ...createEmptyOutfit(), top: 'grm-missing' },
          }),
        ],
      }),
    )
    expect(review.savedOutfits).toHaveLength(1) // kept — the slot just reads empty
    expect(codes(review.issues)).toEqual(['unknown-garment-reference'])
    expect(review.issues[0].severity).toBe('warning')
    expect(review.issues[0].message).toContain('1 piece')
  })

  it('treats an absent current outfit as an empty rail, with no issue', () => {
    const review = reviewArchiveImport(doc({ currentOutfit: undefined }))
    expect(review.currentOutfit).toEqual(createEmptyOutfit())
    expect(review.issues).toEqual([])
  })

  it('warns on a malformed current outfit and imports an empty rail', () => {
    const review = reviewArchiveImport(doc({ currentOutfit: 'top' }))
    expect(review.ok).toBe(true)
    expect(review.currentOutfit).toEqual(createEmptyOutfit())
    expect(codes(review.issues)).toEqual(['invalid-shape'])
    expect(review.issues[0].scope).toBe('current-outfit')
  })

  it('warns when the current outfit references a missing piece', () => {
    const review = reviewArchiveImport(
      doc({ currentOutfit: { ...createEmptyOutfit(), shoes: 'grm-gone' } }),
    )
    expect(review.currentOutfit.shoes).toBe('grm-gone')
    expect(codes(review.issues)).toEqual(['unknown-garment-reference'])
  })
})

describe('summarizeArchiveImport', () => {
  const incoming = reviewArchiveImport(
    doc({
      garments: [
        makeGarment({ id: 'grm-1' }),
        makeGarment({ id: 'grm-2' }),
        makeGarment({ id: 'grm-3' }),
      ],
      savedOutfits: [savedOutfit({ id: 'look-1' }), savedOutfit({ id: 'look-2' })],
    }),
  )
  const existing = {
    garments: [makeGarment({ id: 'grm-1' }), makeGarment({ id: 'grm-local' })],
    savedOutfits: [savedOutfit({ id: 'look-1' })],
  }

  it('merge counts only what is new and never removes anything', () => {
    expect(summarizeArchiveImport(incoming, existing, 'merge')).toEqual({
      mode: 'merge',
      garmentsAdded: 2,
      garmentsSkipped: 1,
      garmentsRemoved: 0,
      savedOutfitsAdded: 1,
      savedOutfitsSkipped: 1,
      savedOutfitsRemoved: 0,
    })
  })

  it('replace counts everything incoming and what the file does not carry', () => {
    expect(summarizeArchiveImport(incoming, existing, 'replace')).toEqual({
      mode: 'replace',
      garmentsAdded: 3,
      garmentsSkipped: 0,
      garmentsRemoved: 1, // grm-local
      savedOutfitsAdded: 2,
      savedOutfitsSkipped: 0,
      savedOutfitsRemoved: 0, // look-1 is in the file
    })
  })
})
