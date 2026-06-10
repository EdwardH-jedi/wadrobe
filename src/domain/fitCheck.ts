// Pure "Fit Check" generation: turns the selected garments of an outfit into a
// short editorial read on palette, tone and style. No React, fully testable.
import type { GarmentItem } from './garmentTypes'
import { isNeutralColorName } from './garmentTaxonomy'
import { relativeLuminance } from '../lib/color'

export type FitRating = 'Empty' | 'Coming together' | 'Strong' | 'Editorial'

export type ToneLabel =
  | 'None'
  | 'Single tone'
  | 'Tonal neutrals'
  | 'Monochrome'
  | 'High contrast'
  | 'Balanced'
  | 'Eclectic'

export interface FitCheckResult {
  filledSlots: number
  totalSlots: number
  /** 0..1 — how many of the five slots are filled. */
  completeness: number
  /** Distinct color hexes present in the look. */
  palette: string[]
  /** Distinct color names present in the look. */
  paletteNames: string[]
  toneLabel: ToneLabel
  /** Up to three most common style tags. */
  dominantTags: string[]
  /** Editorial style phrase derived from dominant tags. */
  styleLabel: string
  /** Short observations to guide the user. */
  notes: string[]
  rating: FitRating
  /**
   * A short, deterministic two-word "vibe" label for the look (an editorial word
   * from the dominant style tag or tone, plus a completeness noun). Used by the
   * saved-look cards. Not AI-generated.
   */
  vibe: string
}

const TOTAL_SLOTS = 5

function titleCase(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

/**
 * Build a fit-check summary from the *resolved* garments of an outfit (the
 * non-empty slots). Order does not matter.
 */
export function generateFitCheck(garments: GarmentItem[]): FitCheckResult {
  const filledSlots = garments.length
  const completeness = filledSlots / TOTAL_SLOTS

  // Distinct palette (preserve first-seen order).
  const palette: string[] = []
  const paletteNames: string[] = []
  for (const g of garments) {
    if (!palette.includes(g.colorHex)) {
      palette.push(g.colorHex)
      paletteNames.push(g.color)
    }
  }

  const toneLabel = deriveTone(garments, palette)

  // Tag tally.
  const tagCounts = new Map<string, number>()
  for (const g of garments) {
    for (const tag of g.styleTags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const dominantTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([tag]) => tag)

  const styleLabel =
    dominantTags.length === 0
      ? 'Undefined'
      : dominantTags.slice(0, 2).map(titleCase).join(' · ')

  return {
    filledSlots,
    totalSlots: TOTAL_SLOTS,
    completeness,
    palette,
    paletteNames,
    toneLabel,
    dominantTags,
    styleLabel,
    notes: deriveNotes(garments, palette, toneLabel),
    rating: deriveRating(filledSlots),
    vibe: deriveVibe(filledSlots, dominantTags, toneLabel),
  }
}

function deriveTone(garments: GarmentItem[], palette: string[]): ToneLabel {
  if (garments.length === 0) return 'None'
  if (palette.length === 1) return 'Single tone'

  const allNeutral = garments.every((g) => isNeutralColorName(g.color))
  if (allNeutral) return 'Tonal neutrals'

  const luminances = palette.map(relativeLuminance)
  const spread = Math.max(...luminances) - Math.min(...luminances)
  if (spread > 0.45) return 'High contrast'

  if (palette.length <= 2) return 'Monochrome'
  if (palette.length >= 4) return 'Eclectic'
  return 'Balanced'
}

function deriveRating(filledSlots: number): FitRating {
  if (filledSlots === 0) return 'Empty'
  if (filledSlots < 3) return 'Coming together'
  if (filledSlots === 3) return 'Strong'
  return 'Editorial'
}

// Editorial adjective per style tag (falls back to title-casing the tag).
const VIBE_WORD: Record<string, string> = {
  minimal: 'Minimal',
  tailored: 'Tailored',
  streetwear: 'Street',
  vintage: 'Vintage',
  archival: 'Archive',
  techwear: 'Tech',
  utility: 'Utility',
  monochrome: 'Mono',
  relaxed: 'Relaxed',
  structured: 'Structured',
  statement: 'Statement',
  workwear: 'Workwear',
  'avant-garde': 'Avant',
  sport: 'Sporty',
  knit: 'Knit',
  denim: 'Denim',
  leather: 'Leather',
}

function toneWord(tone: ToneLabel): string {
  switch (tone) {
    case 'Tonal neutrals':
      return 'Neutral'
    case 'Monochrome':
      return 'Mono'
    case 'Single tone':
      return 'Tonal'
    case 'High contrast':
      return 'Graphic'
    case 'Eclectic':
      return 'Eclectic'
    case 'Balanced':
      return 'Balanced'
    default:
      return 'Quiet'
  }
}

/**
 * Deterministic vibe label: an editorial adjective (the dominant style tag, or
 * the palette tone when there are no tags) plus a noun that grows with the
 * silhouette. `dominantTags` is already tie-broken alphabetically by
 * `generateFitCheck`, so this is stable for a given outfit.
 */
function deriveVibe(
  filledSlots: number,
  dominantTags: string[],
  tone: ToneLabel,
): string {
  if (filledSlots === 0) return 'Unstyled'
  const adj =
    dominantTags.length > 0
      ? (VIBE_WORD[dominantTags[0]] ?? titleCase(dominantTags[0]))
      : toneWord(tone)
  const noun =
    filledSlots >= 4 ? 'silhouette' : filledSlots === 3 ? 'look' : 'layer'
  return `${adj} ${noun}`
}

function deriveNotes(
  garments: GarmentItem[],
  palette: string[],
  tone: ToneLabel,
): string[] {
  const notes: string[] = []
  const categories = new Set(garments.map((g) => g.category))

  if (garments.length === 0) {
    notes.push('Empty rail. Pull a piece from the closet to begin a look.')
    return notes
  }

  if (!categories.has('top') && !categories.has('outerwear')) {
    notes.push('No torso layer yet — add a top or outerwear.')
  }
  if (!categories.has('pants')) {
    notes.push('Bottoms are missing.')
  }
  if (!categories.has('shoes')) {
    notes.push('Add shoes to ground the look.')
  }

  if (tone === 'Tonal neutrals' && garments.length >= 3) {
    notes.push('Disciplined tonal palette — quietly editorial.')
  }
  if (tone === 'High contrast') {
    notes.push('Strong light/dark contrast — confident and graphic.')
  }
  const hasBold = garments.some((g) => !isNeutralColorName(g.color))
  if (hasBold && palette.length >= 3) {
    notes.push('Bold color in the mix — anchor it with a neutral.')
  }

  return notes.slice(0, 4)
}
