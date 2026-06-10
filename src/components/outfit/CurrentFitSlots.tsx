// The current outfit rendered as a list of category slots, each showing the
// selected garment's thumbnail + name (or a clear empty state). Reads the
// outfit from the store, so there is one source of truth — this component is
// pure presentation shared by the full inspector (Mirror view) and the compact
// Studio rail.
import { OUTFIT_SLOT_ORDER } from '../../domain/outfitTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { useArchive } from '../../app/providers/useArchive'
import { cx } from '../../lib/cx'
import { Icon } from '../ui/Icon'

export interface CurrentFitSlotsProps {
  /** Compact = read-only summary (no per-slot clear button). */
  compact?: boolean
}

export function CurrentFitSlots({ compact = false }: CurrentFitSlotsProps) {
  const { currentOutfit, getGarment, clearSlot } = useArchive()

  return (
    <div className={cx('slot-list', compact && 'slot-list--compact')}>
      {OUTFIT_SLOT_ORDER.map((slot) => {
        const meta = CATEGORY_META[slot]
        const id = currentOutfit[slot]
        const garment = id ? getGarment(id) : undefined

        return (
          <div key={slot} className={cx('slot', garment && 'slot--filled')}>
            <div className={cx('slot__thumb', !garment && 'slot__thumb--empty')}>
              {garment ? (
                <img src={getGarmentDisplayImage(garment)} alt={garment.name} />
              ) : (
                <Icon name="hanger" size={18} />
              )}
            </div>
            <div className="slot__info">
              <span className="slot__cat">{meta.label}</span>
              <span
                className={cx('slot__name', !garment && 'slot__name--empty')}
              >
                {garment ? garment.name : `Empty · ${meta.hint}`}
              </span>
            </div>
            {!compact && garment && (
              <button
                className="slot__clear"
                aria-label={`Remove ${meta.label}`}
                onClick={() => clearSlot(slot)}
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
