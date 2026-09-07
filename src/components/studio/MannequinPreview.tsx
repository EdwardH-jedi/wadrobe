// The 2.5D mannequin: a tall, faceless silhouette with the current outfit laid
// over body zones. It is an editorial composition, NOT a simulated "worn"
// garment — nothing here is draped, fitted to a body, or sized.
//
// There are two presentations, and which one a piece gets depends on what its
// image can honestly support at RENDER time (revival Phase 2):
//
//   1. ACCEPTED CUTOUT WITH MEASURED BOUNDS — the garment is placed by
//      `fitCutoutLayer`: the measured content is scaled to its category's target
//      size and centred on its anchor, so what lands on the figure is the
//      clothes rather than the transparent canvas around them. No panel, no
//      blend; the shape floats.
//
//   2. EVERYTHING ELSE — an opaque flat-lay photo, a legacy garment, or a
//      cutout accepted before bounds existed — keeps the original matted panel:
//      the image sits in its body-zone box with `mix-blend-mode: multiply`,
//      which drops a white flat-lay background cheaply against the light paper.
//      That is deliberate: an opaque photo has no alpha to measure, and pretending
//      otherwise would make a bad photo look worse, not better.
//
// The zone geometry itself comes from `domain/garmentLayout.ts` — one owner for
// the numbers, so what the maths says and what the screen shows cannot drift.
import { OUTFIT_SLOT_ORDER } from '../../domain/outfitTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import {
  ZONE_BOXES,
  fitCutoutLayer,
  getLayerGeometry,
  getLayerPreset,
  getLayerZIndex,
  type ZoneBox,
} from '../../domain/garmentLayout'
import { isNormalizedContentBounds } from '../../domain/contentBounds'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { useArchive } from '../../app/providers/useArchive'
import { cx } from '../../lib/cx'

export interface MannequinPreviewProps {
  compact?: boolean
}

/** A zone box as CSS percentages. */
function zoneStyle(box: ZoneBox) {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
  }
}

/** Faceless mannequin silhouette. Drawn abstract; garment layers sit on top. */
function MannequinFigure() {
  return (
    <svg
      className="mannequin__figure"
      viewBox="0 0 320 570"
      role="img"
      aria-label="Faceless styling mannequin"
    >
      <defs>
        <linearGradient id="figureGrad" x1="0" y1="0" x2="1" y2="0.25">
          <stop offset="0" stopColor="#3b3b44" />
          <stop offset="0.5" stopColor="#222228" />
          <stop offset="1" stopColor="#121216" />
        </linearGradient>
      </defs>
      <g fill="url(#figureGrad)">
        <ellipse cx="160" cy="58" rx="33" ry="41" />
        <path d="M150 92 h20 v26 h-20 Z" />
        <path d="M118 122 L202 122 L226 170 L212 250 L200 312 L120 312 L108 250 L94 170 Z" />
        <path d="M120 312 L156 312 L150 478 L122 478 L112 360 Z" />
        <path d="M164 312 L200 312 L208 360 L198 478 L170 478 Z" />
        <ellipse cx="135" cy="500" rx="22" ry="12" />
        <ellipse cx="185" cy="500" rx="22" ry="12" />
      </g>
    </svg>
  )
}

export function MannequinPreview({ compact = false }: MannequinPreviewProps) {
  const { currentOutfit, getGarment } = useArchive()

  return (
    <div className={cx('mannequin', compact && 'mannequin--compact')}>
      <MannequinFigure />

      {OUTFIT_SLOT_ORDER.map((slot) => {
        const meta = CATEGORY_META[slot]
        const box = ZONE_BOXES[meta.zone]
        const id = currentOutfit[slot]
        const garment = id ? getGarment(id) : undefined

        if (!garment) {
          return (
            <div
              key={slot}
              className="mannequin__empty"
              style={zoneStyle(box)}
              aria-hidden="true"
            >
              {!compact && meta.label}
            </div>
          )
        }

        const asset = garment.asset
        const isCutout = asset?.assetMode === 'cutout'
        const zIndex = getLayerZIndex(slot, isCutout)
        const src = getGarmentDisplayImage(garment)

        // A cutout is only FITTED when three things hold.
        //
        //  1. Bounds are present and WELL-FORMED — they come back from storage,
        //     where a truncated or hand-edited record would become `NaN%`.
        //  2. What is rendering is not the last-resort thumbnail. `contentBounds`
        //     describes the CUTOUT, and several paths can leave the bounds on a
        //     garment whose cutout could not be resolved (a missing blob, an
        //     imported piece whose blob ref was dropped) — where the display
        //     degrades to the opaque `imageDataUrl`. Fitting an opaque thumbnail
        //     by a transparent image's measurements would blow it up into a
        //     misplaced rectangle across the figure. `hydrateGarmentForRuntime`
        //     clears the bounds at the one source it owns; this is the sink-side
        //     guard that covers every other route to the same shape.
        //  3. The geometry itself is computable.
        //
        // The thumbnail is never a cutout, and a garment whose display legitimately
        // IS the thumbnail carries `assetMode: 'uploaded'`, so no valid case trips it.
        const bounds = asset?.contentBounds
        const rendersCutout = isCutout && src !== garment.imageDataUrl
        const fitted =
          rendersCutout && isNormalizedContentBounds(bounds)
            ? fitCutoutLayer(getLayerGeometry(slot), bounds)
            : null

        if (fitted) {
          // The image is deliberately drawn larger than its zone and clipped by
          // nothing — a shoe occupying a fifth of its frame needs the frame
          // drawn several times over for the shoe itself to come out life-sized.
          return (
            <div
              key={slot}
              className="mannequin__fitted"
              style={{
                left: `${fitted.leftPct}%`,
                top: `${fitted.topPct}%`,
                width: `${fitted.widthPct}%`,
                zIndex,
              }}
            >
              <img className="mannequin__fittedimg" src={src} alt={garment.name} />
            </div>
          )
        }

        // The original matted panel: the honest presentation for anything
        // without measured transparency.
        const preset = getLayerPreset(slot)
        return (
          <div
            key={slot}
            className={cx(
              'mannequin__zone',
              isCutout && 'mannequin__zone--cutout',
            )}
            style={{ ...zoneStyle(box), zIndex }}
          >
            <span
              className="mannequin__accent"
              style={{ background: garment.colorHex }}
            />
            <img
              className={cx('mannequin__img', isCutout && 'mannequin__img--cutout')}
              src={src}
              alt={garment.name}
              style={{ objectFit: isCutout ? 'contain' : preset.fit }}
            />
            {!compact && <span className="mannequin__tag">{garment.name}</span>}
          </div>
        )
      })}
    </div>
  )
}
