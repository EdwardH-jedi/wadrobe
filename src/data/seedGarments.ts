// Optional sample archive. NOT loaded automatically — the empty states offer a
// "Load sample archive" action so the room can be demoed without uploads.
//
// Images are procedurally-generated SVG flat-lays (data URLs) so there are no
// binary asset dependencies. Real uploads replace these with downscaled photos.
import type { ClothingCategory, GarmentItem } from '../domain/garmentTypes'
import { hexForColorName } from '../domain/garmentTaxonomy'
import { hexToRgb } from '../lib/color'

/** Mix a hex color toward white (amt > 0) or black (amt < 0). */
function shadeHex(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex)
  const target = amt >= 0 ? 255 : 0
  const t = Math.abs(amt)
  const mix = (c: number) => Math.round(c + (target - c) * t)
  const toHex = (c: number) => mix(c).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Garment silhouette paths in a 320×400 viewBox. */
const SHAPES: Record<ClothingCategory, string> = {
  outerwear:
    'M120 70 L160 50 L200 70 L250 95 L235 160 L210 150 L210 360 L110 360 L110 150 L85 160 L70 95 Z',
  top: 'M120 90 L160 70 L200 90 L255 115 L240 165 L210 152 L210 330 L110 330 L110 152 L80 165 L65 115 Z',
  pants:
    'M120 70 L200 70 L208 360 L168 360 L160 180 L152 360 L112 360 Z',
  shoes:
    'M60 250 L70 215 L150 210 L180 235 L255 270 L262 300 L60 300 Z',
  accessory:
    'M80 215 A80 80 0 0 1 240 215 L240 235 L80 235 Z M70 235 L250 235 L250 258 L70 258 Z',
}

function buildGarmentSvg(category: ClothingCategory, hex: string): string {
  const light = shadeHex(hex, 0.18)
  const dark = shadeHex(hex, -0.24)
  const stroke = shadeHex(hex, -0.4)
  const id = `g_${category}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400" width="320" height="400">
<defs>
<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${light}"/>
<stop offset="1" stop-color="${dark}"/>
</linearGradient>
</defs>
<path d="${SHAPES[category]}" fill="url(#${id})" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

interface SeedSpec {
  name: string
  brand: string
  category: ClothingCategory
  color: string
  styleTags: string[]
  notes?: string
}

// Invented house/brand names — not real labels.
const SEED_SPECS: SeedSpec[] = [
  { name: 'Wool Overcoat', brand: 'Maison Grey', category: 'outerwear', color: 'Charcoal', styleTags: ['tailored', 'archival'], notes: 'Double-faced wool, dropped shoulder.' },
  { name: 'Leather Bomber', brand: 'Northpoint', category: 'outerwear', color: 'Espresso', styleTags: ['vintage', 'structured'] },
  { name: 'Boxy Tee', brand: 'Form Studio', category: 'top', color: 'Off White', styleTags: ['minimal', 'relaxed'] },
  { name: 'Merino Knit', brand: 'Atelier No.6', category: 'top', color: 'Olive', styleTags: ['minimal', 'knit'] },
  { name: 'Pleated Trousers', brand: 'Maison Grey', category: 'pants', color: 'Black', styleTags: ['tailored', 'monochrome'] },
  { name: 'Raw Denim', brand: 'Northpoint', category: 'pants', color: 'Indigo', styleTags: ['workwear', 'denim'] },
  { name: 'Leather Derby', brand: 'Atelier No.6', category: 'shoes', color: 'Walnut', styleTags: ['tailored', 'leather'] },
  { name: 'Suede Runner', brand: 'Form Studio', category: 'shoes', color: 'Stone Grey', styleTags: ['streetwear', 'sport'] },
  { name: 'Wool Cap', brand: 'Maison Grey', category: 'accessory', color: 'Charcoal', styleTags: ['minimal', 'utility'] },
  { name: 'Leather Tote', brand: 'Northpoint', category: 'accessory', color: 'Tan', styleTags: ['archival', 'leather'] },
]

const HOUR_MS = 60 * 60 * 1000

/** Build the sample garments with timestamps anchored to `baseTime`. */
export function buildSeedGarments(baseTime: number): GarmentItem[] {
  return SEED_SPECS.map((spec, index) => {
    const colorHex = hexForColorName(spec.color)
    const createdAt = baseTime - index * HOUR_MS
    return {
      id: `seed-${index}-${spec.category}`,
      name: spec.name,
      brand: spec.brand,
      category: spec.category,
      color: spec.color,
      colorHex,
      styleTags: spec.styleTags,
      notes: spec.notes,
      imageDataUrl: buildGarmentSvg(spec.category, colorHex),
      createdAt,
      updatedAt: createdAt,
    }
  })
}
