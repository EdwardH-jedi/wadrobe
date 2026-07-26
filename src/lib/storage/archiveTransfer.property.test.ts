// Property-style round-trip + importer fuzzing.
//
// Two properties, each checked over a few hundred generated cases:
//
//   1. ROUND TRIP. For any valid archive, export → import returns exactly what
//      went in, with no issues raised.
//   2. THE IMPORTER NEVER CORRUPTS. For any mutation of a valid export — junk
//      values, deleted keys, truncated text, injected refs — `reviewArchive-
//      ImportText` neither throws nor produces an archive that violates the
//      storage invariants. A malformed file costs records, never integrity.
//
// Randomness is a seeded PRNG rather than a fuzzing dependency: no new package
// (CLAUDE.md §3), and a failure reproduces from its seed, which is printed in
// the assertion message.
import { describe, expect, it } from 'vitest'
import type {
  ClothingCategory,
  GarmentItem,
  MarketValueEntry,
} from '../../domain/garmentTypes'
import {
  OUTFIT_SLOT_ORDER,
  createEmptyOutfit,
  type OutfitSelection,
  type SavedOutfit,
} from '../../domain/outfitTypes'
import {
  buildArchiveExportBlob,
  writeArchiveExport,
  type ArchiveExportInput,
} from './archiveExport'
import {
  readArchiveFileText,
  reviewArchiveImportText,
  type ArchiveImportReview,
} from './archiveImport'

// --- deterministic randomness ----------------------------------------------

/** mulberry32 — small, fast, well-distributed enough for structural fuzzing. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Gen {
  constructor(private readonly next: () => number) {}
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive)
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]
  }
  bool(trueRatio = 0.5): boolean {
    return this.next() < trueRatio
  }
  /** Include an optional field only sometimes, so shapes vary run to run. */
  maybe<T>(build: () => T): T | undefined {
    return this.bool(0.6) ? build() : undefined
  }
}

const CATEGORIES: ClothingCategory[] = [
  'outerwear',
  'top',
  'pants',
  'shoes',
  'accessory',
]
const ASSET_MODES = ['uploaded', 'cropped', 'cutout', 'product-reference'] as const
const WORDS = ['Wool', 'Boxy', 'Cropped', 'Vintage', 'Racing', 'Bone', 'Ink']
// Both data-URL forms, per spec §5.1.
const IMAGES = [
  'data:image/webp;base64,dGh1bWJuYWlsLWJ5dGVz',
  'data:image/jpeg;base64,Y3JvcC1ieXRlcw==',
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
]

function makeArchive(g: Gen): ArchiveExportInput {
  const garments: GarmentItem[] = []
  const count = g.int(12)
  for (let i = 0; i < count; i += 1) {
    const history = g.maybe<MarketValueEntry[]>(() =>
      Array.from({ length: g.int(4) }, (_, k) => ({
        id: `mv-${i}-${k}`,
        at: 1_700_000_000_000 + k * 86_400_000,
        value: g.int(5000),
        ...(g.bool() ? { currency: g.pick(['USD', 'EUR', 'JPY']) } : {}),
      })),
    )
    const garment: GarmentItem = {
      id: `grm-${i}`,
      name: `${g.pick(WORDS)} ${g.pick(WORDS)}`,
      category: g.pick(CATEGORIES),
      color: g.pick(WORDS),
      colorHex: `#${g.int(0xffffff).toString(16).padStart(6, '0')}`,
      styleTags: Array.from({ length: g.int(4) }, () => g.pick(WORDS)),
      imageDataUrl: g.pick(IMAGES),
      createdAt: 1_600_000_000_000 + g.int(1_000_000),
      updatedAt: 1_700_000_000_000 + g.int(1_000_000),
    }
    // Optional scalars. Assigned only when generated, so `undefined` never
    // becomes a key (JSON would drop it and break equality).
    const brand = g.maybe(() => g.pick(WORDS))
    if (brand !== undefined) garment.brand = brand
    const notes = g.maybe(() => `${g.pick(WORDS)} note`)
    if (notes !== undefined) garment.notes = notes
    const material = g.maybe(() => g.pick(['Nylon', 'Wool', 'Cotton']))
    if (material !== undefined) garment.material = material
    const size = g.maybe(() => g.pick(['XS', 'S', 'M', 'L']))
    if (size !== undefined) garment.size = size
    const price = g.maybe(() => g.int(2000))
    if (price !== undefined) garment.price = price
    const currency = g.maybe(() => g.pick(['USD', 'EUR', 'GBP']))
    if (currency !== undefined) garment.currency = currency
    const subtype = g.maybe(() => g.pick(['bomber', 'crewneck', 'derby']))
    if (subtype !== undefined) garment.subtype = subtype
    const purchasedAt = g.maybe(() => 1_650_000_000_000 + g.int(1_000_000))
    if (purchasedAt !== undefined) garment.purchasedAt = purchasedAt
    const retailer = g.maybe(() => g.pick(WORDS))
    if (retailer !== undefined) garment.retailer = retailer
    const confidence = g.maybe(() => g.int(100) / 100)
    if (confidence !== undefined) garment.analysisConfidence = confidence
    const source = g.maybe(() => g.pick(['mock', 'vision-api'] as const))
    if (source !== undefined) garment.analysisSource = source
    const edited = g.maybe(() => g.bool())
    if (edited !== undefined) garment.userEdited = edited
    if (history !== undefined) garment.marketValueHistory = history

    // Assets carry inline urls only — never a blob ref, which a conforming
    // export must not contain, and never an empty url, which the exporter
    // legitimately rewrites to the thumbnail.
    if (g.bool(0.7)) {
      garment.asset = {
        originalImageUrl: g.pick(IMAGES),
        displayImageUrl: g.pick(IMAGES),
        assetMode: g.pick(ASSET_MODES),
      }
      const cropped = g.maybe(() => g.pick(IMAGES))
      if (cropped !== undefined) garment.asset.croppedImageUrl = cropped
      const cutout = g.maybe(() => g.pick(IMAGES))
      if (cutout !== undefined) garment.asset.cutoutImageUrl = cutout
      const ref = g.maybe(() => 'https://example.invalid/ref.jpg')
      if (ref !== undefined) garment.asset.productReferenceImageUrl = ref
    }
    if (g.bool(0.2)) {
      garment.proxy3dPreview = {
        jobId: `job-${i}`,
        generatedAt: 1_750_000_000_000,
        mode: g.pick(['flat-card', 'single-sided', 'dual-sided'] as const),
        method: 'extruded-alpha-contour',
        limitations: 'Proxy preview only.',
      }
    }
    garments.push(garment)
  }

  const pickId = (): string | null =>
    garments.length > 0 && g.bool(0.6) ? g.pick(garments).id : null
  const selection = (): OutfitSelection => {
    const out = createEmptyOutfit()
    for (const slot of OUTFIT_SLOT_ORDER) out[slot] = pickId()
    return out
  }

  const savedOutfits: SavedOutfit[] = Array.from(
    { length: g.int(4) },
    (_, i): SavedOutfit => ({
      id: `look-${i}`,
      name: `${g.pick(WORDS)} Look`,
      selection: selection(),
      createdAt: 1_750_000_000_000 + i,
      coverHex: '#2b2b2e',
    }),
  )

  return { garments, savedOutfits, currentOutfit: selection() }
}

async function exportText(input: ArchiveExportInput): Promise<string> {
  const chunks: string[] = []
  await writeArchiveExport(input, (c) => chunks.push(c), { now: 1_753_577_000_000 })
  return chunks.join('')
}

// --- invariants an imported archive must always satisfy ---------------------

const SLOTS = [...OUTFIT_SLOT_ORDER].sort()

/** The asset fields a renderer loads as an image — mirrors the importer's list. */
const ASSET_URL_FIELDS = [
  'displayImageUrl',
  'cutoutImageUrl',
  'croppedImageUrl',
  'originalImageUrl',
  'thumbnailImageUrl',
  'productReferenceImageUrl',
] as const

function assertSelectionSound(selection: OutfitSelection, where: string) {
  expect(Object.keys(selection).sort(), where).toEqual(SLOTS)
  for (const slot of OUTFIT_SLOT_ORDER) {
    const value = selection[slot]
    expect(value === null || typeof value === 'string', `${where}.${slot}`).toBe(true)
  }
}

/**
 * Everything that must hold of a review's output no matter how mangled the
 * input was. A violation here means the importer would have written a corrupt
 * archive to storage.
 */
function assertReviewSound(review: ArchiveImportReview, where: string) {
  // A rejected document commits nothing at all.
  if (!review.ok) {
    expect(review.garments, where).toEqual([])
    expect(review.savedOutfits, where).toEqual([])
    expect(review.issues.length, where).toBeGreaterThan(0)
  }

  for (const issue of review.issues) {
    expect(typeof issue.message, where).toBe('string')
    expect(issue.message.length, where).toBeGreaterThan(0)
    expect(['dropped', 'warning'], where).toContain(issue.severity)
    expect(
      ['document', 'garment', 'saved-outfit', 'current-outfit'],
      where,
    ).toContain(issue.scope)
  }

  const seen = new Set<string>()
  for (const g of review.garments) {
    const at = `${where} garment ${g.id}`
    expect(typeof g.id, at).toBe('string')
    expect(typeof g.name, at).toBe('string')
    expect(CATEGORIES, at).toContain(g.category)
    expect(typeof g.color, at).toBe('string')
    expect(typeof g.colorHex, at).toBe('string')
    expect(Array.isArray(g.styleTags), at).toBe(true)
    expect(g.styleTags.every((t) => typeof t === 'string'), at).toBe(true)
    expect(typeof g.imageDataUrl, at).toBe('string')
    expect(Number.isFinite(g.createdAt), at).toBe(true)
    expect(Number.isFinite(g.updatedAt), at).toBe(true)

    expect(seen.has(g.id), `${at} duplicate id`).toBe(false)
    seen.add(g.id)

    if (g.asset !== undefined) {
      // An asset survives only as a plain object, never a scalar or array.
      expect(typeof g.asset, at).toBe('object')
      expect(g.asset === null, at).toBe(false)
      expect(Array.isArray(g.asset), at).toBe(false)
      // Nothing unresolvable on this machine may be persisted (spec §5.2–5.3).
      // Scoped to the url fields a renderer actually loads: a junk `assetMode`
      // is tolerated by design (spec §8.3), so serializing the whole asset and
      // grepping it would fail on a value that is never fetched.
      expect(g.asset.croppedImageRef, at).toBeUndefined()
      expect(g.asset.cutoutImageRef, at).toBeUndefined()
      for (const field of ASSET_URL_FIELDS) {
        const value = g.asset[field]
        if (typeof value === 'string') {
          expect(value.startsWith('blob:'), `${at}.${field}`).toBe(false)
        }
      }
    }
    if (g.marketValueHistory !== undefined) {
      expect(Array.isArray(g.marketValueHistory), at).toBe(true)
      for (const entry of g.marketValueHistory!) {
        expect(typeof entry.id, at).toBe('string')
        expect(Number.isFinite(entry.at), at).toBe(true)
        expect(Number.isFinite(entry.value), at).toBe(true)
      }
    }
  }

  const outfitIds = new Set<string>()
  for (const outfit of review.savedOutfits) {
    const at = `${where} outfit ${outfit.id}`
    expect(typeof outfit.id, at).toBe('string')
    expect(typeof outfit.name, at).toBe('string')
    expect(typeof outfit.coverHex, at).toBe('string')
    expect(Number.isFinite(outfit.createdAt), at).toBe(true)
    expect(outfitIds.has(outfit.id), `${at} duplicate id`).toBe(false)
    outfitIds.add(outfit.id)
    assertSelectionSound(outfit.selection, at)
  }

  assertSelectionSound(review.currentOutfit, `${where} currentOutfit`)
}

// --- property 1: round trip -------------------------------------------------

describe('property: any valid archive survives export → import unchanged', () => {
  it('returns identical garments, looks and current outfit over 150 archives', async () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const where = `seed ${seed}`
      const input = makeArchive(new Gen(rng(seed)))

      const review = reviewArchiveImportText(await exportText(input))

      expect(review.ok, where).toBe(true)
      expect(review.issues, where).toEqual([])
      expect(review.garments, where).toEqual(input.garments)
      expect(review.savedOutfits, where).toEqual(input.savedOutfits)
      expect(review.currentOutfit, where).toEqual(input.currentOutfit)
      assertReviewSound(review, where)
    }
  })

  it('is idempotent — re-exporting an import yields the same document', async () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const where = `seed ${seed}`
      const input = makeArchive(new Gen(rng(seed)))

      const first = await exportText(input)
      const review = reviewArchiveImportText(first)
      const second = await exportText({
        garments: review.garments,
        savedOutfits: review.savedOutfits,
        currentOutfit: review.currentOutfit,
      })

      expect(second, where).toBe(first)
    }
  })

  it('builds a blob whose text is byte-identical to the streamed chunks', async () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const input = makeArchive(new Gen(rng(seed)))
      const { blob, stats } = await buildArchiveExportBlob(input, {
        now: 1_753_577_000_000,
      })

      // jsdom has no Blob.text(); readArchiveFileText falls back to FileReader.
      expect(await readArchiveFileText(blob), `seed ${seed}`).toBe(
        await exportText(input),
      )
      expect(stats.garmentCount, `seed ${seed}`).toBe(input.garments.length)
    }
  })
})

// --- property 2: the importer never corrupts --------------------------------

/** Values chosen to break naive type assumptions. */
const JUNK: unknown[] = [
  null,
  0,
  -1,
  1e308,
  '',
  'not-a-number',
  true,
  false,
  [],
  {},
  [null, null],
  { kind: 'indexeddb-blob', key: 'asset_1_elsewhere' },
  'blob:http://localhost:5173/dead-handle',
  { __proto__: { polluted: true } },
  'data:image/webp;base64,!!!not-base64!!!',
]

/** Every path into a nested object/array, as arrays of keys. */
function paths(node: unknown, prefix: (string | number)[] = []): (string | number)[][] {
  if (typeof node !== 'object' || node === null || prefix.length > 5) return []
  const here: (string | number)[][] = []
  const entries: [string | number, unknown][] = Array.isArray(node)
    ? node.map((v, i) => [i, v])
    : Object.entries(node as Record<string, unknown>)
  for (const [key, value] of entries) {
    here.push([...prefix, key])
    here.push(...paths(value, [...prefix, key]))
  }
  return here
}

function atPath(root: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (node as Record<string | number, unknown>)?.[key],
    root,
  )
}

/** Apply one structural mutation in place. */
function mutate(doc: unknown, g: Gen): void {
  const all = paths(doc)
  if (all.length === 0) return
  const path = g.pick(all)
  const parent = atPath(doc, path.slice(0, -1)) as Record<string | number, unknown>
  const key = path[path.length - 1]
  if (parent === null || typeof parent !== 'object') return

  switch (g.int(4)) {
    case 0: // delete
      if (Array.isArray(parent)) parent.splice(Number(key), 1)
      else delete parent[key]
      break
    case 1: // replace with junk
      parent[key] = g.pick(JUNK)
      break
    case 2: // duplicate (array) or alias a sibling (object)
      if (Array.isArray(parent)) parent.splice(Number(key), 0, parent[Number(key)])
      else parent[key] = atPath(doc, g.pick(all))
      break
    default: // deeply nest
      parent[key] = { wrapped: parent[key] }
  }
}

describe('property: the importer never throws and never yields a corrupt archive', () => {
  it('survives structurally mutated exports (400 cases)', async () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const where = `seed ${seed}`
      const g = new Gen(rng(seed))
      const doc: unknown = JSON.parse(await exportText(makeArchive(g)))

      const mutations = 1 + g.int(6)
      for (let i = 0; i < mutations; i += 1) mutate(doc, g)

      let text: string
      try {
        text = JSON.stringify(doc)
      } catch {
        continue // a mutation made the document circular; not an importer concern
      }

      let review: ArchiveImportReview
      expect(() => {
        review = reviewArchiveImportText(text)
      }, where).not.toThrow()
      assertReviewSound(review!, where)
    }
  })

  it('survives text-level corruption — truncation and byte splicing (300 cases)', async () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const where = `seed ${seed}`
      const g = new Gen(rng(seed))
      const text = await exportText(makeArchive(g))
      if (text.length < 10) continue

      const damaged = g.bool()
        ? text.slice(0, 1 + g.int(text.length - 1)) // truncated mid-write
        : text.slice(0, g.int(text.length)) +
          g.pick([' ', '}', '"', '\\', '{', ']', '\uD800']) +
          text.slice(g.int(text.length))

      let review: ArchiveImportReview
      expect(() => {
        review = reviewArchiveImportText(damaged)
      }, where).not.toThrow()
      assertReviewSound(review!, where)
    }
  })

  it('never treats a non-document as importable', () => {
    const notDocuments = [
      '',
      '   ',
      'null',
      'true',
      '42',
      '"a string"',
      '[]',
      '[{"kind":"fit-archive.archive","schemaVersion":1,"garments":[]}]',
      '{}',
      '{"kind":"fit-archive.archive"}',
      '{"kind":"fit-archive.archive","schemaVersion":"1","garments":[]}',
      '{"kind":"fit-archive.archive","schemaVersion":1}',
      '{"kind":"fit-archive.archive","schemaVersion":1,"garments":{}}',
      '{"kind":"other","schemaVersion":1,"garments":[]}',
    ]

    for (const text of notDocuments) {
      const review = reviewArchiveImportText(text)

      expect(review.ok, JSON.stringify(text)).toBe(false)
      assertReviewSound(review, JSON.stringify(text))
    }
  })

  it('cannot be made to import a prototype-polluting document', () => {
    const text = JSON.stringify({
      kind: 'fit-archive.archive',
      schemaVersion: 1,
      garments: [
        {
          id: 'grm-1',
          name: 'Polluter',
          category: 'top',
          color: 'Bone',
          colorHex: '#fff',
          styleTags: [],
          imageDataUrl: 'data:image/png,x',
          createdAt: 1,
          updatedAt: 1,
          __proto__: { polluted: true },
        },
      ],
      currentOutfit: { __proto__: { polluted: true }, top: 'grm-1' },
    })

    const review = reviewArchiveImportText(text)

    assertReviewSound(review, 'prototype pollution')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })
})
