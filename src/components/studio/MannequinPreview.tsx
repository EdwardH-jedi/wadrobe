// The 2.5D mannequin: a tall, faceless silhouette with the current outfit
// mapped onto body zones as framed, matted garment panels (an editorial
// collage — NOT a simulated "worn" garment). White flat-lay backgrounds are
// dropped cheaply via `mix-blend-mode: multiply` against the light panels.
import { OUTFIT_SLOT_ORDER } from '../../domain/outfitTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import { getLayerPreset, getLayerZIndex } from '../../domain/garmentLayout'
import {
  getGarmentMannequinImage,
  mannequinShowsCutout,
} from '../../domain/garmentAsset'
import { useArchive } from '../../app/providers/useArchive'
import { cx } from '../../lib/cx'

export interface MannequinPreviewProps {
  compact?: boolean
}

/** Faceless mannequin silhouette. Drawn abstract; garment panels sit on top. */
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
        const id = currentOutfit[slot]
        const garment = id ? getGarment(id) : undefined
        const zoneClass = `zone-${meta.zone}`

        if (!garment) {
          return (
            <div
              key={slot}
              className={cx('mannequin__empty', zoneClass)}
              aria-hidden="true"
            >
              {!compact && meta.label}
            </div>
          )
        }

        // Category layer preset drives the per-zone presentation (fit + stacking)
        // on top of the CSS zone geometry. `contain` keeps wide/odd pieces
        // (shoes, accessories) from being aggressively cropped.
        const preset = getLayerPreset(slot)
        // A transparent cutout floats as a collage element: it takes its natural
        // stacking order (outerwear above the top) and drops the matte paper
        // panel + multiply blend that exist only to mask opaque flat-lay
        // backgrounds (Phase 5). `contain` shows the whole garment shape.
        const isCutout = mannequinShowsCutout(garment)

        return (
          <div
            key={slot}
            className={cx(
              'mannequin__zone',
              zoneClass,
              isCutout && 'mannequin__zone--cutout',
            )}
            style={{ zIndex: getLayerZIndex(slot, isCutout) }}
          >
            <span
              className="mannequin__accent"
              style={{ background: garment.colorHex }}
            />
            <img
              className={cx('mannequin__img', isCutout && 'mannequin__img--cutout')}
              src={getGarmentMannequinImage(garment)}
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
