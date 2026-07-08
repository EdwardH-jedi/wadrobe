// A chrome-framed mirror reflecting the current outfit on the mannequin. The
// full (Mirror view) variant adds a caption that summarizes the composition so
// the mirror reinforces the outfit rather than reading as decorative glass.
// This is a stylized 2.5D layered preview — never real 3D try-on.
import { useState } from 'react'
import {
  OUTFIT_SLOT_ORDER,
  countFilledSlots,
  isOutfitEmpty,
  silhouetteHint,
} from '../../domain/outfitTypes'
import type { GarmentItem } from '../../domain/garmentTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import { mannequinShowsCutout } from '../../domain/garmentAsset'
import { useArchive } from '../../app/providers/useArchive'
import { Button } from '../ui/Button'
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

/** Honest, opt-in control that drops flat-lay backgrounds on the mannequin.
 *  Runs the SAME on-device flood fill per styled piece; pieces it can't clean
 *  keep their original photo. Never claims a guaranteed clean cutout. */
function MannequinCutoutControl({ styled }: { styled: GarmentItem[] }) {
  const { prepareMannequinCutout } = useArchive()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const pending = styled.filter((g) => !mannequinShowsCutout(g))

  const run = async () => {
    setBusy(true)
    setStatus(null)
    const results = await Promise.all(
      pending.map((g) => prepareMannequinCutout(g.id)),
    )
    const prepared = results.filter((r) => r === 'prepared').length
    setBusy(false)
    setStatus(
      prepared > 0
        ? `Dropped the background on ${prepared} piece${
            prepared === 1 ? '' : 's'
          }.${prepared < results.length ? ' The rest kept your original photo.' : ''}`
        : 'Kept your original photos — background removal works best on a plain, flat-lay shot.',
    )
  }

  return (
    <div className="mirror__cutout">
      <Button
        variant="quiet"
        size="sm"
        onClick={run}
        disabled={busy || pending.length === 0}
      >
        {busy
          ? 'Removing backgrounds locally…'
          : pending.length === 0
            ? 'Backgrounds removed'
            : 'Remove photo backgrounds'}
      </Button>
      <p className="muted mirror__hint">
        Local background removal for the mannequin — quality varies with the
        photo, and pieces it can&apos;t clean keep your original.
      </p>
      {status && (
        <p className="muted mirror__hint" role="status">
          {status}
        </p>
      )}
    </div>
  )
}

/** Full Mirror view: the framed mannequin plus a composition caption. */
function MirrorView() {
  const { currentOutfit, getGarment } = useArchive()
  const empty = isOutfitEmpty(currentOutfit)
  const filled = countFilledSlots(currentOutfit)
  const hint = silhouetteHint(currentOutfit)
  const styled = OUTFIT_SLOT_ORDER.map((slot) => {
    const id = currentOutfit[slot]
    return id ? getGarment(id) : undefined
  }).filter((g): g is GarmentItem => g !== undefined)

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
            <MannequinCutoutControl styled={styled} />
          </>
        )}
      </div>
    </div>
  )
}
