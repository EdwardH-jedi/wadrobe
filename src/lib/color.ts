// Small, dependency-free color utilities shared by the fit-check and mock analyzer.
import { COLOR_OPTIONS, type ColorOption } from '../domain/garmentTaxonomy'

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Parse a #rrggbb (or #rgb) hex string into RGB. Defaults to charcoal. */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) {
    return { r: 43, g: 43, b: 48 }
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/**
 * Relative luminance (0..1) using the sRGB coefficients. Good enough for the
 * fit-check's "light vs dark contrast" heuristic.
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Squared RGB distance between two hex colors. */
function colorDistanceSq(a: string, b: string): number {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return (x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2
}

/** Nearest curated palette option to an arbitrary hex value. */
export function nearestColorOption(hex: string): ColorOption {
  let best = COLOR_OPTIONS[0]
  let bestDist = Infinity
  for (const option of COLOR_OPTIONS) {
    const dist = colorDistanceSq(hex, option.hex)
    if (dist < bestDist) {
      bestDist = dist
      best = option
    }
  }
  return best
}
