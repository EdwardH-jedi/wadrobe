// Archive import — read an export document back in, honestly.
//
// Two rules shape this module:
//
// 1. VALIDATE THROUGH THE EXISTING PARSERS. Every entry goes through
//    `parseGarments` / `parseSavedOutfits` / `parseCurrentOutfit` from
//    `storageTypes.ts`, one entry at a time, so an imported record can never be
//    less trustworthy than a persisted one and the two paths cannot drift.
// 2. REPORT, DON'T SWALLOW. The bulk parsers silently drop malformed entries —
//    correct for a storage read, wrong for a user-initiated import. Running them
//    per entry lets us say exactly what was skipped and why, as a list of
//    `ArchiveImportIssue`s the UI shows before anything is committed.
//
// Reviewing is PURE and commits nothing: `reviewArchiveImport` returns the
// validated data plus its issues, and the caller decides whether (and how) to
// apply it. Merging vs replacing is the user's choice — see `ArchiveImportMode`.
import type { GarmentItem } from '../../domain/garmentTypes'
import {
  OUTFIT_SLOT_ORDER,
  createEmptyOutfit,
  type OutfitSelection,
  type SavedOutfit,
} from '../../domain/outfitTypes'
import {
  ARCHIVE_EXPORT_KIND,
  ARCHIVE_EXPORT_SCHEMA_VERSION,
} from './archiveExport'
import {
  parseCurrentOutfit,
  parseGarments,
  parseSavedOutfits,
} from './storageTypes'

/**
 * How an import is applied.
 * - `merge` — add what is new, keep every existing piece/look on an id clash.
 *   The current outfit is left alone. Never destructive.
 * - `replace` — the file becomes the archive. Only ever on an explicit choice.
 */
export type ArchiveImportMode = 'merge' | 'replace'

export type ArchiveImportScope =
  | 'document'
  | 'garment'
  | 'saved-outfit'
  | 'current-outfit'

export interface ArchiveImportIssue {
  scope: ArchiveImportScope
  /** `dropped` — the entry was discarded. `warning` — kept, but altered/suspect. */
  severity: 'dropped' | 'warning'
  /** Stable machine code, e.g. `invalid-shape`. */
  code: string
  /** One-line explanation, shown verbatim in the import report. */
  message: string
}

export interface ArchiveImportReview {
  /**
   * True when the DOCUMENT is usable. Individual dropped entries do not make an
   * import fail — they are reported and the rest is still importable.
   */
  ok: boolean
  schemaVersion: number | null
  /** Epoch milliseconds the file was exported, when the document states it. */
  exportedAt: number | null
  garments: GarmentItem[]
  savedOutfits: SavedOutfit[]
  currentOutfit: OutfitSelection
  issues: ArchiveImportIssue[]
}

export interface ArchiveImportSummary {
  mode: ArchiveImportMode
  garmentsAdded: number
  /** merge only: incoming pieces whose id is already archived (existing wins). */
  garmentsSkipped: number
  /** replace only: existing pieces the file does not contain. */
  garmentsRemoved: number
  savedOutfitsAdded: number
  savedOutfitsSkipped: number
  savedOutfitsRemoved: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function emptyReview(issue: ArchiveImportIssue): ArchiveImportReview {
  return {
    ok: false,
    schemaVersion: null,
    exportedAt: null,
    garments: [],
    savedOutfits: [],
    currentOutfit: createEmptyOutfit(),
    issues: [issue],
  }
}

function documentFailure(code: string, message: string): ArchiveImportReview {
  return emptyReview({ scope: 'document', severity: 'dropped', code, message })
}

/** A short human handle for a malformed entry, so the report is actionable. */
function describeEntry(entry: unknown, index: number): string {
  if (isRecord(entry) && typeof entry.name === 'string' && entry.name.length > 0) {
    return `"${entry.name}"`
  }
  if (isRecord(entry) && typeof entry.id === 'string' && entry.id.length > 0) {
    return `id ${entry.id}`
  }
  return `entry #${index + 1}`
}

/** Asset fields that hold an image url, in the order the display chain reads. */
const ASSET_URL_FIELDS = [
  'displayImageUrl',
  'cutoutImageUrl',
  'croppedImageUrl',
  'originalImageUrl',
  'thumbnailImageUrl',
  'productReferenceImageUrl',
] as const

/**
 * Make an imported garment's asset safe to persist on THIS machine. Two things
 * a conforming export never contains, but a hand-edited or non-conforming file
 * can (see docs/ARCHIVE_EXPORT_SCHEMA.md §5.2–§5.3):
 *
 * 1. Blob refs — a key into the IndexedDB asset store of the profile that wrote
 *    it, which resolves to nothing here.
 * 2. `blob:` object URLs — process-local handles from the exporting tab's
 *    session. Kept, they would render as permanently broken images.
 *
 * Both are removed rather than repaired. The inline images the exporter wrote
 * stay, and the display chain falls through to the `imageDataUrl` thumbnail at
 * worst, so the piece always keeps rendering.
 */
function sanitizeImportedAsset(
  garment: GarmentItem,
  issues: ArchiveImportIssue[],
): GarmentItem {
  const asset = garment.asset
  if (!asset) return garment

  const hasRef = !!(asset.croppedImageRef || asset.cutoutImageRef)
  // A well-shaped asset is not a well-TYPED one: fields inside it are validated
  // by use, so a hand-edited file can put a number here. Check the type, not
  // just presence — `?.startsWith` would throw on a non-string.
  const deadUrls = ASSET_URL_FIELDS.filter((field) => {
    const value = asset[field]
    return typeof value === 'string' && value.startsWith('blob:')
  })
  if (!hasRef && deadUrls.length === 0) return garment

  const cleaned = { ...asset }
  if (hasRef) {
    delete cleaned.croppedImageRef
    delete cleaned.cutoutImageRef
    issues.push({
      scope: 'garment',
      severity: 'warning',
      code: 'foreign-blob-ref',
      message: `"${garment.name}" pointed at image data stored in another browser profile — the pointer was dropped and the piece keeps its inline images.`,
    })
  }
  for (const field of deadUrls) {
    // Required-by-type fields are blanked rather than deleted; the display chain
    // skips empty strings exactly as it skips absent ones.
    if (field === 'displayImageUrl' || field === 'originalImageUrl') {
      cleaned[field] = ''
    } else {
      delete cleaned[field]
    }
  }
  if (deadUrls.length > 0) {
    issues.push({
      scope: 'garment',
      severity: 'warning',
      code: 'process-local-url',
      message: `"${garment.name}" carried ${deadUrls.length} temporary image link${
        deadUrls.length === 1 ? '' : 's'
      } from the exporting browser session — dropped, so the piece falls back to its stored image.`,
    })
  }
  return { ...garment, asset: cleaned }
}

/** Slots pointing at a garment id the document does not contain. */
function unknownSlotCount(
  selection: OutfitSelection,
  knownIds: Set<string>,
): number {
  return OUTFIT_SLOT_ORDER.reduce((n, slot) => {
    const id = selection[slot]
    return id && !knownIds.has(id) ? n + 1 : n
  }, 0)
}

/**
 * Validate a parsed JSON value as an export document. Never throws; a document
 * that cannot be trusted comes back with `ok: false` and one explaining issue.
 */
export function reviewArchiveImport(raw: unknown): ArchiveImportReview {
  // An array is `typeof 'object'` but is never a document envelope.
  if (!isRecord(raw) || Array.isArray(raw)) {
    return documentFailure(
      'not-an-object',
      'This file is not an archive export — the JSON is not an object.',
    )
  }
  if (raw.kind !== ARCHIVE_EXPORT_KIND) {
    return documentFailure(
      'wrong-kind',
      `This file is not an archive export (expected "kind": "${ARCHIVE_EXPORT_KIND}").`,
    )
  }
  const schemaVersion = raw.schemaVersion
  if (typeof schemaVersion !== 'number' || !Number.isFinite(schemaVersion)) {
    return documentFailure(
      'unsupported-schema-version',
      'This export is missing a usable schema version.',
    )
  }
  if (schemaVersion > ARCHIVE_EXPORT_SCHEMA_VERSION) {
    return documentFailure(
      'unsupported-schema-version',
      `This export is schema version ${schemaVersion}; this build reads up to ${ARCHIVE_EXPORT_SCHEMA_VERSION}. Update the app first.`,
    )
  }
  if (!Array.isArray(raw.garments)) {
    return documentFailure(
      'missing-garments',
      'This export has no "garments" list, so there is nothing to import.',
    )
  }

  const issues: ArchiveImportIssue[] = []

  // --- Garments: one at a time, through the storage validator ---------------
  const garments: GarmentItem[] = []
  const garmentIds = new Set<string>()
  raw.garments.forEach((entry, index) => {
    const parsed = parseGarments([entry])
    if (parsed.length === 0) {
      issues.push({
        scope: 'garment',
        severity: 'dropped',
        code: 'invalid-shape',
        message: `Piece ${describeEntry(entry, index)} is missing or has malformed required fields (id, name, category, color, image, timestamps) — skipped.`,
      })
      return
    }
    const garment = parsed[0]
    if (garmentIds.has(garment.id)) {
      issues.push({
        scope: 'garment',
        severity: 'dropped',
        code: 'duplicate-id',
        message: `Piece "${garment.name}" repeats id ${garment.id} inside the file — the later copy was skipped.`,
      })
      return
    }
    garmentIds.add(garment.id)
    garments.push(sanitizeImportedAsset(garment, issues))
  })

  // --- Saved outfits --------------------------------------------------------
  const savedOutfits: SavedOutfit[] = []
  if (raw.savedOutfits !== undefined && !Array.isArray(raw.savedOutfits)) {
    issues.push({
      scope: 'saved-outfit',
      severity: 'dropped',
      code: 'invalid-shape',
      message: 'The "savedOutfits" field is not a list — no looks were imported.',
    })
  } else if (Array.isArray(raw.savedOutfits)) {
    const outfitIds = new Set<string>()
    raw.savedOutfits.forEach((entry, index) => {
      const parsed = parseSavedOutfits([entry])
      if (parsed.length === 0) {
        issues.push({
          scope: 'saved-outfit',
          severity: 'dropped',
          code: 'invalid-shape',
          message: `Look ${describeEntry(entry, index)} is missing or has malformed required fields (id, name, selection, coverHex, createdAt) — skipped.`,
        })
        return
      }
      const outfit = parsed[0]
      if (outfitIds.has(outfit.id)) {
        issues.push({
          scope: 'saved-outfit',
          severity: 'dropped',
          code: 'duplicate-id',
          message: `Look "${outfit.name}" repeats id ${outfit.id} inside the file — the later copy was skipped.`,
        })
        return
      }
      outfitIds.add(outfit.id)
      const unknown = unknownSlotCount(outfit.selection, garmentIds)
      if (unknown > 0) {
        issues.push({
          scope: 'saved-outfit',
          severity: 'warning',
          code: 'unknown-garment-reference',
          message: `Look "${outfit.name}" references ${unknown} piece${
            unknown === 1 ? '' : 's'
          } that this file does not contain — those slots will show as empty.`,
        })
      }
      savedOutfits.push(outfit)
    })
  }

  // --- Current outfit -------------------------------------------------------
  // An absent/null value is a legitimate "nothing styled", not a problem.
  let currentOutfit = createEmptyOutfit()
  if (raw.currentOutfit !== undefined && raw.currentOutfit !== null) {
    const parsed = parseCurrentOutfit(raw.currentOutfit)
    if (!parsed) {
      issues.push({
        scope: 'current-outfit',
        severity: 'warning',
        code: 'invalid-shape',
        message:
          'The saved "current outfit" is malformed — it will be imported as an empty rail.',
      })
    } else {
      currentOutfit = parsed
      const unknown = unknownSlotCount(parsed, garmentIds)
      if (unknown > 0) {
        issues.push({
          scope: 'current-outfit',
          severity: 'warning',
          code: 'unknown-garment-reference',
          message: `The current outfit references ${unknown} piece${
            unknown === 1 ? '' : 's'
          } that this file does not contain — those slots stay empty.`,
        })
      }
    }
  }

  return {
    ok: true,
    schemaVersion,
    exportedAt:
      typeof raw.exportedAt === 'number' && Number.isFinite(raw.exportedAt)
        ? raw.exportedAt
        : null,
    garments,
    savedOutfits,
    currentOutfit,
    issues,
  }
}

/**
 * Read a picked file as text. Uses `Blob.text()` where it exists and falls back
 * to `FileReader` (jsdom has the latter but not the former), mirroring
 * `archiveExport.blobToDataUrl`. Standard browser APIs only.
 */
export function readArchiveFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'))
    reader.readAsText(file)
  })
}

/** `reviewArchiveImport` over raw file text; malformed JSON is an issue, not a throw. */
export function reviewArchiveImportText(text: string): ArchiveImportReview {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return documentFailure(
      'not-json',
      'This file is not valid JSON, so it cannot be read as an archive export.',
    )
  }
  return reviewArchiveImport(parsed)
}

/**
 * What applying `review` in `mode` would do to `existing` — computed before the
 * commit so the UI can state the outcome in plain numbers. Mirrors the
 * reducer's `IMPORT_ARCHIVE` rules exactly (merge: existing wins on an id clash).
 */
export function summarizeArchiveImport(
  review: ArchiveImportReview,
  existing: { garments: GarmentItem[]; savedOutfits: SavedOutfit[] },
  mode: ArchiveImportMode,
): ArchiveImportSummary {
  const incomingGarmentIds = new Set(review.garments.map((g) => g.id))
  const incomingOutfitIds = new Set(review.savedOutfits.map((o) => o.id))

  if (mode === 'replace') {
    return {
      mode,
      garmentsAdded: review.garments.length,
      garmentsSkipped: 0,
      garmentsRemoved: existing.garments.filter(
        (g) => !incomingGarmentIds.has(g.id),
      ).length,
      savedOutfitsAdded: review.savedOutfits.length,
      savedOutfitsSkipped: 0,
      savedOutfitsRemoved: existing.savedOutfits.filter(
        (o) => !incomingOutfitIds.has(o.id),
      ).length,
    }
  }

  const existingGarmentIds = new Set(existing.garments.map((g) => g.id))
  const existingOutfitIds = new Set(existing.savedOutfits.map((o) => o.id))
  const garmentsSkipped = review.garments.filter((g) =>
    existingGarmentIds.has(g.id),
  ).length
  const savedOutfitsSkipped = review.savedOutfits.filter((o) =>
    existingOutfitIds.has(o.id),
  ).length
  return {
    mode,
    garmentsAdded: review.garments.length - garmentsSkipped,
    garmentsSkipped,
    garmentsRemoved: 0,
    savedOutfitsAdded: review.savedOutfits.length - savedOutfitsSkipped,
    savedOutfitsSkipped,
    savedOutfitsRemoved: 0,
  }
}
