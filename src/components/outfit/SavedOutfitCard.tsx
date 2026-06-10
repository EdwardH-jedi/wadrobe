import type { GarmentItem } from '../../domain/garmentTypes'
import type { SavedOutfit } from '../../domain/outfitTypes'
import { OUTFIT_SLOT_ORDER } from '../../domain/outfitTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import { generateFitCheck } from '../../domain/fitCheck'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { useArchive } from '../../app/providers/useArchive'
import { formatDate } from '../../lib/format'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

export interface SavedOutfitCardProps {
  outfit: SavedOutfit
  index?: number
  onRestore: (id: string) => void
  onRemove: (id: string) => void
}

export function SavedOutfitCard({
  outfit,
  index = 0,
  onRestore,
  onRemove,
}: SavedOutfitCardProps) {
  const { getGarment } = useArchive()

  const cells = OUTFIT_SLOT_ORDER.map((slot) => {
    const id = outfit.selection[slot]
    return id ? getGarment(id) : undefined
  })
  const resolved = cells.filter((g): g is GarmentItem => Boolean(g))
  const pieceCount = resolved.length
  const categoryText = OUTFIT_SLOT_ORDER.filter((_, i) => cells[i])
    .map((slot) => CATEGORY_META[slot].label)
    .join(' · ')
  // Deterministic vibe (not AI). Hidden for a hollow look whose garments have
  // all been deleted from the archive, so a stale look never reads as broken.
  const vibe = pieceCount > 0 ? generateFitCheck(resolved).vibe : ''

  return (
    <article
      className="savedcard"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="savedcard__cover" style={{ background: outfit.coverHex }} />
      <div className="savedcard__strip">
        {cells.map((garment, i) =>
          garment ? (
            <div key={i} className="savedcard__cell">
              <img src={getGarmentDisplayImage(garment)} alt={garment.name} />
            </div>
          ) : (
            <div key={i} className="savedcard__cell savedcard__cell--empty" />
          ),
        )}
      </div>
      <div className="savedcard__body">
        {pieceCount > 0 && <span className="savedcard__vibe">{vibe}</span>}
        <h3 className="savedcard__name">{outfit.name}</h3>
        <span className="savedcard__meta">
          {categoryText && `${categoryText} · `}
          {formatDate(outfit.createdAt)}
        </span>
      </div>
      <div className="savedcard__actions">
        <Button size="sm" variant="primary" onClick={() => onRestore(outfit.id)}>
          <Icon name="mirror" size={14} />
          Restore fit
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => onRemove(outfit.id)}
          aria-label="Delete look"
        >
          <Icon name="trash" size={15} />
        </Button>
      </div>
    </article>
  )
}
