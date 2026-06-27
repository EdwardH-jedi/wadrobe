// Pure helpers for the optional real vision analyzer (Phase 4).
//
// The network call itself lives in the thin `api/analyze` Edge handler; this
// module holds the deterministic, unit-tested pieces shared by that handler and
// the front-end backend analyzer: the request schema/instruction, a data-URL →
// image-source splitter, and a defensive parser that normalizes a provider's raw
// JSON into a GarmentAnalysisGuess. NO network here, NO model — and brand is only
// ever kept when the provider actually returns a non-empty one (no fabrication).
import type { ClothingCategory } from '../../domain/garmentTypes'
import type { GarmentAnalysisGuess } from './garmentAnalysisTypes'

const CLOTHING_CATEGORIES = new Set<ClothingCategory>([
  'outerwear',
  'top',
  'pants',
  'shoes',
  'accessory',
])

const HEX_RE = /^#[0-9a-f]{6}$/i
const DEFAULT_HEX = '#2b2b30'

/** JSON schema the provider's structured output must match (used by the handler). */
export const VISION_GUESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: ['outerwear', 'top', 'pants', 'shoes', 'accessory'],
    },
    color: { type: 'string' },
    colorHex: { type: 'string' },
    styleTags: { type: 'array', items: { type: 'string' } },
    brand: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['category', 'color', 'colorHex', 'styleTags', 'confidence'],
} as const

/** Instruction for the vision provider. Honest + non-fabricating on brand. */
export function buildVisionInstruction(): string {
  return [
    'You are cataloguing a single clothing item from its photo for a personal',
    'wardrobe archive. Return ONLY the structured fields:',
    '- category: one of outerwear, top, pants, shoes, accessory.',
    '- color: a short human color name (e.g. "Charcoal", "Off White").',
    '- colorHex: the dominant color as #rrggbb.',
    '- styleTags: 1–3 short lowercase descriptors (e.g. "minimal", "denim").',
    '- confidence: your confidence from 0 to 1.',
    '- brand: ONLY if a logo or brand text is clearly legible; otherwise omit it.',
    'Never guess or invent a brand. This is a draft the user will confirm.',
  ].join(' ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Split a `data:<mime>;base64,<data>` URL into the parts an image content block
 * needs. Returns null for anything that is not a base64 data URL.
 */
export function dataUrlToImageSource(
  dataUrl: string,
): { mediaType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) return null
  const mediaType = match[1].trim()
  const data = match[2].trim()
  if (!mediaType.startsWith('image/') || !data) return null
  return { mediaType, data }
}

/**
 * Validate + normalize a provider's raw JSON into a `GarmentAnalysisGuess` with
 * `source: 'vision-api'`. Returns null when the result is unusable (no valid
 * category) so the caller can fall back to the mock. A malformed `colorHex`
 * falls back to the sampled `dominantColorHex`, then a neutral default.
 */
export function parseVisionGuess(
  raw: unknown,
  dominantColorHex?: string,
): GarmentAnalysisGuess | null {
  if (!isRecord(raw)) return null
  const category = raw.category
  if (typeof category !== 'string' || !CLOTHING_CATEGORIES.has(category as ClothingCategory)) {
    return null
  }

  const colorHex =
    typeof raw.colorHex === 'string' && HEX_RE.test(raw.colorHex)
      ? raw.colorHex
      : dominantColorHex && HEX_RE.test(dominantColorHex)
        ? dominantColorHex
        : DEFAULT_HEX

  const color =
    typeof raw.color === 'string' && raw.color.trim()
      ? raw.color.trim()
      : 'Unspecified'

  const styleTags = Array.isArray(raw.styleTags)
    ? raw.styleTags
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim().toLowerCase())
        .slice(0, 3)
    : []

  const confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.7

  const brand =
    typeof raw.brand === 'string' && raw.brand.trim() ? raw.brand.trim() : undefined

  return {
    category: category as ClothingCategory,
    color,
    colorHex,
    styleTags,
    confidence,
    source: 'vision-api',
    brand,
  }
}
