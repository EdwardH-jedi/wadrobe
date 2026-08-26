// Mock garment analysis — the DEFAULT analyzer.
//
// Returns a deterministic, plausible guess derived from the file name and an
// optional dominant color. It performs no network calls and no canvas work, so
// it runs anywhere. This is the default; the real-vision seam is wired (Phase 4)
// in `createAnalyzer.ts` (selected by env) with the provider call in the
// `api/analyze` Edge handler, and `runGarmentAnalysis` routes through it. When a
// real provider runs, the "user confirms before save" step still applies —
// guesses stay non-binding.
import type { ClothingCategory } from '../../domain/garmentTypes'
import {
  COLOR_OPTIONS,
  hexForColorName,
  type ColorOption,
} from '../../domain/garmentTaxonomy'
import { nearestColorOption } from '../color'
import type {
  GarmentAnalysisGuess,
  GarmentAnalysisInput,
} from './garmentAnalysisTypes'
import { createAnalyzer } from './createAnalyzer'

// --- Keyword tables -------------------------------------------------------

// Checked in order; the first category whose keyword appears in the file name
// wins. Outerwear is checked before tops so "overshirt" / "blazer" resolve
// correctly even though they contain "shirt"-like fragments.
const CATEGORY_KEYWORDS: Array<{
  category: ClothingCategory
  words: string[]
}> = [
  {
    category: 'outerwear',
    words: [
      'coat',
      'jacket',
      'parka',
      'blazer',
      'trench',
      'puffer',
      'overshirt',
      'bomber',
      'windbreaker',
      'outer',
    ],
  },
  {
    category: 'shoes',
    words: [
      'shoe',
      'sneaker',
      'boot',
      'loafer',
      'heel',
      'trainer',
      'derby',
      'sandal',
      'footwear',
    ],
  },
  {
    category: 'pants',
    words: [
      'pant',
      'trouser',
      'jean',
      'denim',
      'chino',
      'cargo',
      'short',
      'skirt',
      'slack',
    ],
  },
  {
    category: 'top',
    words: [
      'tee',
      'tshirt',
      't-shirt',
      'shirt',
      'sweater',
      'knit',
      'hoodie',
      'blouse',
      'polo',
      'jumper',
      'cardigan',
      'tank',
      'top',
    ],
  },
  {
    category: 'accessory',
    words: [
      'hat',
      'cap',
      'beanie',
      'belt',
      'bag',
      'scarf',
      'glasses',
      'watch',
      'ring',
      'necklace',
      'glove',
      'tie',
      'accessory',
    ],
  },
]

// Maps loose color words found in file names onto curated palette names.
const COLOR_KEYWORDS: Array<{ words: string[]; colorName: string }> = [
  { words: ['black'], colorName: 'Black' },
  { words: ['charcoal'], colorName: 'Charcoal' },
  { words: ['graphite'], colorName: 'Graphite' },
  { words: ['grey', 'gray'], colorName: 'Stone Grey' },
  { words: ['white', 'ivory'], colorName: 'Off White' },
  { words: ['cream'], colorName: 'Cream' },
  { words: ['sand', 'beige'], colorName: 'Sand' },
  { words: ['tan', 'camel'], colorName: 'Tan' },
  { words: ['brown', 'walnut'], colorName: 'Walnut' },
  { words: ['espresso', 'chocolate'], colorName: 'Espresso' },
  { words: ['navy'], colorName: 'Navy' },
  { words: ['indigo'], colorName: 'Indigo' },
  { words: ['blue'], colorName: 'Slate Blue' },
  { words: ['olive'], colorName: 'Olive' },
  { words: ['green', 'forest'], colorName: 'Forest' },
  { words: ['burgundy', 'maroon'], colorName: 'Burgundy' },
  { words: ['rust'], colorName: 'Rust' },
  { words: ['ochre', 'mustard'], colorName: 'Ochre' },
  { words: ['red'], colorName: 'Bone Red' },
]

// Per-category style tag pools the mock draws from.
const TAG_POOLS: Record<ClothingCategory, string[]> = {
  outerwear: ['tailored', 'structured', 'utility', 'techwear', 'archival'],
  top: ['minimal', 'relaxed', 'streetwear', 'monochrome', 'knit'],
  pants: ['utility', 'tailored', 'relaxed', 'workwear', 'denim'],
  shoes: ['streetwear', 'minimal', 'sport', 'archival', 'leather'],
  accessory: ['statement', 'minimal', 'vintage', 'utility', 'leather'],
}

// --- Deterministic helpers ------------------------------------------------

/** djb2 string hash → unsigned 32-bit. */
function hashString(value: string): number {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
  }
  return hash
}

function detectCategory(name: string): { category: ClothingCategory; matched: boolean } {
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.words.some((w) => name.includes(w))) {
      return { category: entry.category, matched: true }
    }
  }
  // Fallback: deterministic pick from the hash.
  const categories: ClothingCategory[] = [
    'outerwear',
    'top',
    'pants',
    'shoes',
    'accessory',
  ]
  return { category: categories[hashString(name) % categories.length], matched: false }
}

function detectColor(
  name: string,
  dominantColorHex: string | undefined,
  hash: number,
): { option: ColorOption; matched: boolean } {
  for (const entry of COLOR_KEYWORDS) {
    if (entry.words.some((w) => name.includes(w))) {
      const hex = hexForColorName(entry.colorName)
      const option =
        COLOR_OPTIONS.find((c) => c.name === entry.colorName) ?? COLOR_OPTIONS[0]
      return { option: { ...option, hex }, matched: true }
    }
  }
  if (dominantColorHex) {
    return { option: nearestColorOption(dominantColorHex), matched: true }
  }
  return { option: COLOR_OPTIONS[hash % COLOR_OPTIONS.length], matched: false }
}

function pickTags(category: ClothingCategory, hash: number): string[] {
  const pool = TAG_POOLS[category]
  // Use the UNSIGNED right shift: `>>` coerces to Int32 and can go negative for
  // hashes >= 2^31, which would produce a negative (out-of-bounds) index.
  const first = pool[hash % pool.length]
  const second = pool[(hash >>> 3) % pool.length]
  return first === second ? [first] : [first, second]
}

/** Confidence: higher when we matched real keywords, lower for pure guesses. */
function computeConfidence(
  categoryMatched: boolean,
  colorMatched: boolean,
  hash: number,
): number {
  const jitter = (hash % 9) / 100 // 0.00 .. 0.08
  let base: number
  if (categoryMatched && colorMatched) base = 0.85
  else if (categoryMatched || colorMatched) base = 0.74
  else base = 0.58
  return Math.round((base + jitter) * 100) / 100
}

// --- Public API -----------------------------------------------------------

/** Pure, synchronous mock analysis. Deterministic for a given input. */
export function analyzeGarmentMock(
  input: GarmentAnalysisInput,
): GarmentAnalysisGuess {
  const name = input.fileName.toLowerCase()
  const sizeSalt = String(input.fileSizeBytes ?? 0)
  const hash = hashString(name + ':' + sizeSalt)

  const { category, matched: categoryMatched } = detectCategory(name)
  const { option, matched: colorMatched } = detectColor(
    name,
    input.dominantColorHex,
    hash,
  )

  return {
    category,
    color: option.name,
    colorHex: option.hex,
    styleTags: pickTags(category, hash),
    confidence: computeConfidence(categoryMatched, colorMatched, hash),
    source: 'mock',
  }
}

/**
 * Async entry point the UI calls. Routes through the analyzer factory
 * (`createAnalyzer`) instead of binding the mock directly, so the provider seam
 * is honored: env unset → the mock (the default), `VITE_API_BASE` **and**
 * `VITE_ANALYZER=vision` → the backend vision analyzer, which falls back to this
 * mock on any failure. The "scanning" animation duration is owned by the UI, not
 * this function.
 */
export function runGarmentAnalysis(
  input: GarmentAnalysisInput,
): Promise<GarmentAnalysisGuess> {
  return createAnalyzer().analyze(input)
}
