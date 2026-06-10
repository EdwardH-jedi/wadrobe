// Per-category quick pickers for assembling a look without leaving the mirror.
// Selecting a piece replaces whatever currently fills that category slot.
import { OUTFIT_SLOT_ORDER } from '../../domain/outfitTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { useArchive } from '../../app/providers/useArchive'
import { cx } from '../../lib/cx'

export interface OutfitBuilderProps {
  onUpload: () => void
}

export function OutfitBuilder({ onUpload }: OutfitBuilderProps) {
  const { garmentsByCategory, currentOutfit, selectGarment, clearSlot } =
    useArchive()

  return (
    <div className="col" style={{ gap: 16 }}>
      {OUTFIT_SLOT_ORDER.map((slot) => {
        const meta = CATEGORY_META[slot]
        const items = garmentsByCategory(slot)
        const selectedId = currentOutfit[slot]

        return (
          <div key={slot} className="col" style={{ gap: 8 }}>
            <div className="row between">
              <span className="eyebrow">{meta.plural}</span>
              {selectedId ? (
                <button
                  className="btn btn--quiet btn--sm"
                  onClick={() => clearSlot(slot)}
                >
                  Clear
                </button>
              ) : (
                <span className="muted" style={{ fontSize: 11 }}>
                  {items.length}
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <button
                className="filmstrip__empty"
                style={{ textAlign: 'left' }}
                onClick={onUpload}
              >
                No {meta.plural.toLowerCase()} yet — upload one.
              </button>
            ) : (
              <div className="filmstrip__track">
                {items.map((garment) => (
                  <button
                    key={garment.id}
                    type="button"
                    title={garment.name}
                    className={cx(
                      'filmstrip__item',
                      selectedId === garment.id && 'filmstrip__item--selected',
                    )}
                    onClick={() => selectGarment(garment.id)}
                  >
                    <img src={getGarmentDisplayImage(garment)} alt={garment.name} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
