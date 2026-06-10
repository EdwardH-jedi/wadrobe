// Category-based body-zone layer presets for the 2.5D mannequin (Phase 9).
//
// These presets carry the *semantic* layer info the mannequin applies on top of
// each garment panel — which body region it anchors to, how it should be fit
// inside its frame, and its stacking order. The raw pixel positions (top/left/
// width/height) stay in CSS (`.zone-*` in archive-theme.css), which was visually
// verified in earlier phases; the preset is the single source of truth for the
// per-category *presentation* (fit + z-order), not the geometry, so the two never
// drift by duplicating percentages.
import type { ClothingCategory } from './garmentTypes'

/** Which body region a garment layer anchors to. */
export type LayerAnchor = 'torso' | 'legs' | 'feet' | 'upper-side'

/**
 * How the garment image fills its panel. `cover` for body garments that read
 * well cropped to the frame; `contain` for wide/odd-shaped pieces (shoes,
 * accessories) so they are not aggressively cropped.
 */
export type LayerFit = 'cover' | 'contain'

/** A hint about the garment photo's natural aspect, for future framing logic. */
export type LayerAspectHint = 'wide' | 'tall' | 'square' | 'free'

export interface GarmentLayerPreset {
  category: ClothingCategory
  anchor: LayerAnchor
  /** Relative emphasis of the panel within its zone (semantic; 0–1.2). */
  scale: number
  /** Stacking order of the panel on the mannequin. */
  zIndex: number
  fit: LayerFit
  aspectHint?: LayerAspectHint
}

/**
 * Per-category presets.
 *
 * NOTE on `zIndex` — the Phase 9 spec suggests "outerwear should visually layer
 * above top". The verified mannequin geometry has the top's panel entirely
 * INSIDE the outerwear panel, and panels are OPAQUE (no real cutout yet), so
 * stacking outerwear above top would fully occlude a selected top — a broken
 * collage. We therefore keep the eyeball-verified order (outerwear behind, top
 * in front) so both stay visible. True outerwear-above-top is deferred to the
 * cutout era, where transparent garments make the overlap readable.
 */
export const LAYER_PRESETS: Record<ClothingCategory, GarmentLayerPreset> = {
  outerwear: {
    category: 'outerwear',
    anchor: 'torso',
    scale: 1,
    zIndex: 1,
    fit: 'cover',
    aspectHint: 'wide',
  },
  top: {
    category: 'top',
    anchor: 'torso',
    scale: 0.85,
    zIndex: 2,
    fit: 'cover',
    aspectHint: 'square',
  },
  pants: {
    category: 'pants',
    anchor: 'legs',
    scale: 0.9,
    zIndex: 2,
    fit: 'cover',
    aspectHint: 'tall',
  },
  shoes: {
    category: 'shoes',
    anchor: 'feet',
    scale: 0.8,
    zIndex: 3,
    fit: 'contain',
    aspectHint: 'wide',
  },
  accessory: {
    category: 'accessory',
    anchor: 'upper-side',
    scale: 0.6,
    zIndex: 5,
    fit: 'contain',
    aspectHint: 'square',
  },
}

/** Look up the layer preset for a category. */
export function getLayerPreset(category: ClothingCategory): GarmentLayerPreset {
  return LAYER_PRESETS[category]
}
