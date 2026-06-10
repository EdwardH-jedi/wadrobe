// The bottom "rail": every archived piece as a thumbnail strip. Clicking a
// piece styles it into the current outfit.
import { OUTFIT_SLOT_ORDER } from '../../domain/outfitTypes'
import { useArchive } from '../../app/providers/useArchive'
import { cx } from '../../lib/cx'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

export interface GarmentFilmstripProps {
  onUpload: () => void
  uploadDisabled?: boolean
  /** When set, this just-archived piece plays the "entering the rail" animation. */
  highlightId?: string | null
}

export function GarmentFilmstrip({
  onUpload,
  uploadDisabled = false,
  highlightId,
}: GarmentFilmstripProps) {
  const { garments, currentOutfit, selectGarment } = useArchive()

  const selectedIds = new Set(
    OUTFIT_SLOT_ORDER.map((slot) => currentOutfit[slot]).filter(
      (id): id is string => id !== null,
    ),
  )

  return (
    <div className="filmstrip">
      <div className="filmstrip__inner">
        <div className="filmstrip__label">
          <b className="display">The Rail</b>
          <span className="eyebrow">{garments.length} pieces</span>
        </div>

        <div className="filmstrip__track">
          {garments.length === 0 ? (
            <span className="filmstrip__empty">
              Nothing archived yet — upload your first piece.
            </span>
          ) : (
            garments.map((garment) => (
              <button
                key={garment.id}
                type="button"
                className={cx(
                  'filmstrip__item',
                  selectedIds.has(garment.id) && 'filmstrip__item--selected',
                  highlightId === garment.id && 'filmstrip__item--enter',
                )}
                title={`${garment.name} — style this`}
                onClick={() => selectGarment(garment.id)}
              >
                <img src={getGarmentDisplayImage(garment)} alt={garment.name} />
              </button>
            ))
          )}
        </div>

        <Button
          size="sm"
          variant="primary"
          disabled={uploadDisabled}
          onClick={onUpload}
        >
          <Icon name="plus" size={15} />
          Upload
        </Button>
      </div>
    </div>
  )
}
