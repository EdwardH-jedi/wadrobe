// Category-based body-zone layout for the 2.5D mannequin.
//
// ONE OWNER (revival Phase 2). The semantic layer info (anchor, fit, stacking)
// and the actual geometry used to live in two places — these presets and a set
// of `.zone-*` percentage rules in archive-theme.css — which meant the numbers
// that decide where a garment lands could drift from the rules that decide how
// it is presented. The percentages now live here, as data, and the component
// applies them; the CSS keeps only appearance (paper, vignette, blend).
//
// Everything in this file is pure and deterministic: same garment, same
// numbers, every time. That is what makes the fitting testable without a DOM.
import type { NormalizedContentBounds } from './contentBounds'
import type { ClothingCategory } from './garmentTypes'
import type { BodyZone } from './garmentTaxonomy'

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
 * INSIDE the outerwear panel, and OPAQUE flat-lay panels mean stacking outerwear
 * above top would fully occlude a selected top — a broken collage. So this base
 * order keeps the eyeball-verified arrangement (outerwear behind, top in front)
 * for opaque panels. The natural outerwear-above-top order is activated only for
 * transparent cutouts, via `getLayerZIndex` (Phase 5), where the overlap reads.
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

/**
 * Effective stacking order for a garment panel (Phase 5). The base preset order
 * holds for OPAQUE flat-lay panels. When a garment is shown as a transparent
 * CUTOUT, the occlusion concern that pins outerwear behind the top disappears,
 * so outerwear takes its natural place ABOVE the top (still below the
 * upper-side accessory). All other categories keep their preset order.
 */
export function getLayerZIndex(
  category: ClothingCategory,
  isCutout: boolean,
): number {
  if (isCutout && category === 'outerwear') {
    // Above the top, below the accessory — the natural "jacket over shirt" drape.
    return LAYER_PRESETS.top.zIndex + 2
  }
  return LAYER_PRESETS[category].zIndex
}

// --- Geometry -----------------------------------------------------------------

/**
 * The mannequin stage's aspect (width / height). It is fixed — the figure is
 * drawn in a `0 0 320 570` viewBox and the stage carries `aspect-ratio: 1/1.78`
 * — and the fitting maths needs it to convert a horizontal fraction into a
 * vertical one. Changing it here means changing `.mannequin`'s aspect too.
 */
export const MANNEQUIN_ASPECT = 1 / 1.78

/** A rectangle over the mannequin stage, as fractions of its width and height. */
export interface ZoneBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Body-zone boxes, previously the `.zone-*` rules in archive-theme.css. These
 * are the eyeball-verified positions from earlier phases, moved verbatim so the
 * change of owner did not also change the layout.
 *
 * They still drive the OPAQUE panel presentation and the empty-slot
 * placeholders. Accepted cutouts with measured bounds are placed by
 * `fitCutoutLayer` instead, which uses the anchors below.
 */
export const ZONE_BOXES: Record<BodyZone, ZoneBox> = {
  accessory: { x: 0.37, y: 0.03, width: 0.26, height: 0.125 },
  torsoOuter: { x: 0.15, y: 0.19, width: 0.7, height: 0.34 },
  torso: { x: 0.28, y: 0.22, width: 0.44, height: 0.27 },
  legs: { x: 0.3, y: 0.49, width: 0.4, height: 0.34 },
  feet: { x: 0.3, y: 0.825, width: 0.4, height: 0.12 },
}

/**
 * Where a cutout garment's CONTENT should land on the figure, and how big it
 * should be — as fractions of the mannequin stage.
 *
 * This is deliberately a small explicit table rather than a geometry engine.
 * There are five categories; five hand-tuned entries are easier to read, easier
 * to adjust by eye, and impossible to get subtly wrong in a way a general
 * solver could.
 *
 * `anchorX`/`anchorY` are the point the content box is CENTRED on, chosen
 * against the figure's own silhouette (drawn in a 320x570 viewBox):
 *   head 17..99  ·  torso 118..312  ·  legs 312..478  ·  feet ~488..512
 *
 * `targetWidth` is the content's width, and `maxHeight` caps it so a very tall
 * photo is scaled down to fit its region rather than running over the figure.
 * The smaller of the two constraints wins, so the garment always keeps its own
 * proportions — nothing is ever stretched.
 */
export interface GarmentLayerGeometry {
  anchorX: number
  anchorY: number
  targetWidth: number
  maxHeight: number
}

export const LAYER_GEOMETRY: Record<ClothingCategory, GarmentLayerGeometry> = {
  // Sits over the torso and reaches past it — a coat is the widest layer.
  outerwear: { anchorX: 0.5, anchorY: 0.37, targetWidth: 0.62, maxHeight: 0.4 },
  // Centred on the chest, inside the outerwear's span.
  top: { anchorX: 0.5, anchorY: 0.35, targetWidth: 0.46, maxHeight: 0.28 },
  // From the waist down the legs; narrower than the torso, and much taller.
  pants: { anchorX: 0.5, anchorY: 0.66, targetWidth: 0.4, maxHeight: 0.36 },
  // The case content bounds exist for. A shoe photo is mostly empty canvas, so
  // fitting the CANVAS into the old 40%x12% box left a tiny shoe floating above
  // the ankles. Fitting the CONTENT lets it be as wide as real footwear.
  shoes: { anchorX: 0.5, anchorY: 0.888, targetWidth: 0.36, maxHeight: 0.11 },
  // Head/upper area: small, and never allowed to dominate the face-less head.
  accessory: { anchorX: 0.5, anchorY: 0.1, targetWidth: 0.24, maxHeight: 0.13 },
}

/** Look up the fitting geometry for a category. */
export function getLayerGeometry(
  category: ClothingCategory,
): GarmentLayerGeometry {
  return LAYER_GEOMETRY[category]
}

/**
 * The placement of an `<img>` inside the mannequin stage, as percentages ready
 * for CSS. The image is positioned by its own top-left corner and sized by
 * width alone (height follows from the image's aspect), which is what lets the
 * CONTENT — not the transparent canvas around it — land on the anchor.
 */
export interface FittedLayer {
  /** Left edge of the IMAGE, as a % of stage width. May be negative. */
  leftPct: number
  /** Top edge of the IMAGE, as a % of stage height. May be negative. */
  topPct: number
  /** Width of the IMAGE, as a % of stage width. Exceeds 100 when the content
   *  is a small part of a large canvas — that is the point. */
  widthPct: number
}

/**
 * Place a transparent cutout so its garment lands on the body.
 *
 * The maths, in stage-width fractions (W = stage width, H = stage height):
 *
 *   The content occupies `bounds.width` of the image, so to give the content a
 *   width of `targetWidth` the whole image must be drawn at
 *       imageWidth = targetWidth / bounds.width
 *
 *   The image's drawn height is `imageWidth / sourceAspect` in W-units, which is
 *   `imageWidth / sourceAspect * (W/H)` as a fraction of stage HEIGHT. The
 *   content's share of that is `bounds.height` of it — and if that exceeds
 *   `maxHeight`, the whole thing is scaled down by the shortfall so the garment
 *   keeps its proportions.
 *
 *   Finally the image is shifted so the content's centre sits on the anchor.
 *
 * Pure: same inputs, same numbers, no DOM. Returns `null` for bounds that would
 * divide by zero, so a corrupt record falls back rather than rendering at NaN%.
 */
export function fitCutoutLayer(
  geometry: GarmentLayerGeometry,
  bounds: NormalizedContentBounds,
  stageAspect: number = MANNEQUIN_ASPECT,
): FittedLayer | null {
  if (
    !(bounds.width > 0) ||
    !(bounds.height > 0) ||
    !(bounds.sourceAspect > 0) ||
    !(stageAspect > 0)
  ) {
    return null
  }

  // Width the whole image must be drawn at for the content to hit its target.
  let imageWidth = geometry.targetWidth / bounds.width

  // imageWidth is in stage-WIDTH units; its drawn height in those same units is
  // imageWidth / sourceAspect. Converting a width-fraction to a height-fraction
  // multiplies by (stage width / stage height) = stageAspect.
  const imageHeightInStageHeights = (w: number) =>
    (w / bounds.sourceAspect) * stageAspect
  const contentHeight = imageHeightInStageHeights(imageWidth) * bounds.height

  if (contentHeight > geometry.maxHeight) {
    // Too tall for its region: scale the whole image down uniformly. Never
    // squash — a stretched garment is worse than a small one.
    imageWidth *= geometry.maxHeight / contentHeight
  }

  const imageHeight = imageHeightInStageHeights(imageWidth)

  // Centre of the content within the image, in image-relative fractions.
  const contentCentreX = bounds.x + bounds.width / 2
  const contentCentreY = bounds.y + bounds.height / 2

  return {
    leftPct: (geometry.anchorX - contentCentreX * imageWidth) * 100,
    topPct: (geometry.anchorY - contentCentreY * imageHeight) * 100,
    widthPct: imageWidth * 100,
  }
}
