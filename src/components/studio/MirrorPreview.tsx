// A chrome-framed mirror reflecting the current outfit on the mannequin. The
// full (Mirror view) variant adds a caption that summarizes the composition so
// the mirror reinforces the outfit rather than reading as decorative glass.
// This is a stylized 2.5D layered preview — never real 3D try-on.
import {
  OUTFIT_SLOT_ORDER,
  countFilledSlots,
  isOutfitEmpty,
  silhouetteHint,
} from '../../domain/outfitTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import { useArchive } from '../../app/providers/useArchive'
import { MannequinPreview } from './MannequinPreview'

export interface MirrorPreviewProps {
  /** 'scene' = compact mirror in the studio room; 'full' = the Mirror view. */
  variant?: 'scene' | 'full'
}

export function MirrorPreview({ variant = 'full' }: MirrorPreviewProps) {
  if (variant === 'scene') {
    return (
      <div className="mirror">
        <div className="mirror__glass">
          <MannequinPreview compact />
          <span className="mirror__shimmer" />
        </div>
      </div>
    )
  }

  return <MirrorView />
}

/** Full Mirror view: the framed mannequin plus a composition caption. */
function MirrorView() {
  const { currentOutfit, getGarment } = useArchive()
  const empty = isOutfitEmpty(currentOutfit)
  const filled = countFilledSlots(currentOutfit)
  const hint = silhouetteHint(currentOutfit)

  return (
    <div className="mirror__col">
      <div className="mirrorview__stage">
        <div className="mirrorview__glass">
          <MannequinPreview />
          <span className="mirror__shimmer" />
        </div>
      </div>

      <div className="mirror__caption">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="mirror__title display">Mirror composition</div>
            <div className="eyebrow" style={{ marginTop: 4 }}>
              2.5D layered styling preview
            </div>
          </div>
          <span className="mirror__count">{filled}/5 layers</span>
        </div>

        {empty ? (
          <p className="muted mirror__hint">
            Select archive pieces to build a fit.
          </p>
        ) : (
          <>
            <div className="mirror__chips">
              {OUTFIT_SLOT_ORDER.map((slot) => {
                const id = currentOutfit[slot]
                const garment = id ? getGarment(id) : undefined
                if (!garment) return null
                return (
                  <span key={slot} className="mirror__chip">
                    <span
                      className="mirror__chip-dot"
                      style={{ background: garment.colorHex }}
                    />
                    {CATEGORY_META[slot].label}
                  </span>
                )
              })}
            </div>
            {hint && <p className="muted mirror__hint">{hint}</p>}
          </>
        )}
      </div>
    </div>
  )
}
