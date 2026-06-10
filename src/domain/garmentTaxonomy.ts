// Single source of truth for category metadata, color options and style tags.
// Used by the editor, the mock analyzer, seed data, cards and the mannequin map.
import type { ClothingCategory } from './garmentTypes'

/** Where a category maps onto the 2.5D mannequin. */
export type BodyZone = 'torsoOuter' | 'torso' | 'legs' | 'feet' | 'accessory'

export interface CategoryMeta {
  id: ClothingCategory
  /** Singular label, e.g. "Outerwear". */
  label: string
  /** Plural/section label used by closet tabs, e.g. "Outerwear". */
  plural: string
  /** Body zone the garment overlays on the mannequin. */
  zone: BodyZone
  /** Short editorial hint shown in empty slots. */
  hint: string
}

/** Canonical category order used everywhere garments are listed. */
export const CATEGORY_ORDER: ClothingCategory[] = [
  'outerwear',
  'top',
  'pants',
  'shoes',
  'accessory',
]

export const CATEGORY_META: Record<ClothingCategory, CategoryMeta> = {
  outerwear: {
    id: 'outerwear',
    label: 'Outerwear',
    plural: 'Outerwear',
    zone: 'torsoOuter',
    hint: 'Coat, jacket or overshirt',
  },
  top: {
    id: 'top',
    label: 'Top',
    plural: 'Tops',
    zone: 'torso',
    hint: 'Tee, knit or shirt',
  },
  pants: {
    id: 'pants',
    label: 'Pants',
    plural: 'Pants',
    zone: 'legs',
    hint: 'Trousers, denim or shorts',
  },
  shoes: {
    id: 'shoes',
    label: 'Shoes',
    plural: 'Shoes',
    zone: 'feet',
    hint: 'Sneakers, boots or loafers',
  },
  accessory: {
    id: 'accessory',
    label: 'Accessory',
    plural: 'Accessories',
    zone: 'accessory',
    hint: 'Hat, bag or jewelry',
  },
}

export interface ColorOption {
  name: string
  hex: string
  /** Neutral tones drive the "tonal discipline" fit-check heuristic. */
  neutral: boolean
}

/** Curated, editorial-leaning palette. */
export const COLOR_OPTIONS: ColorOption[] = [
  { name: 'Black', hex: '#16161a', neutral: true },
  { name: 'Charcoal', hex: '#2b2b30', neutral: true },
  { name: 'Graphite', hex: '#3f4046', neutral: true },
  { name: 'Stone Grey', hex: '#8a8a90', neutral: true },
  { name: 'Off White', hex: '#ece8e1', neutral: true },
  { name: 'Cream', hex: '#e4dccb', neutral: true },
  { name: 'Sand', hex: '#cbbba0', neutral: true },
  { name: 'Tan', hex: '#b08a5e', neutral: true },
  { name: 'Walnut', hex: '#6b4a33', neutral: true },
  { name: 'Espresso', hex: '#3b2a20', neutral: true },
  { name: 'Navy', hex: '#23303f', neutral: false },
  { name: 'Indigo', hex: '#34406b', neutral: false },
  { name: 'Slate Blue', hex: '#4f6076', neutral: false },
  { name: 'Olive', hex: '#5a5a3c', neutral: false },
  { name: 'Forest', hex: '#2f4636', neutral: false },
  { name: 'Burgundy', hex: '#5a2330', neutral: false },
  { name: 'Rust', hex: '#8a4a2f', neutral: false },
  { name: 'Ochre', hex: '#b8893b', neutral: false },
  { name: 'Bone Red', hex: '#7c3a3a', neutral: false },
  { name: 'Ice Blue', hex: '#9fb4c2', neutral: false },
]

/** Suggested style tags surfaced in the editor and seeded by the mock analyzer. */
export const STYLE_TAG_SUGGESTIONS: string[] = [
  'minimal',
  'tailored',
  'streetwear',
  'vintage',
  'archival',
  'techwear',
  'utility',
  'monochrome',
  'relaxed',
  'structured',
  'statement',
  'workwear',
  'avant-garde',
  'sport',
]

const NEUTRAL_NAMES = new Set(
  COLOR_OPTIONS.filter((c) => c.neutral).map((c) => c.name.toLowerCase()),
)

/** Whether a color label is considered neutral (drives fit-check tone logic). */
export function isNeutralColorName(name: string): boolean {
  return NEUTRAL_NAMES.has(name.trim().toLowerCase())
}

/** Look up a hex for a color name, defaulting to charcoal. */
export function hexForColorName(name: string): string {
  const match = COLOR_OPTIONS.find(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
  )
  return match?.hex ?? '#2b2b30'
}
