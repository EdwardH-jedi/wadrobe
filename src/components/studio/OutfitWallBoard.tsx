// The wall board: every saved look as an editorial card.
import { isOutfitEmpty } from '../../domain/outfitTypes'
import { useArchive } from '../../app/providers/useArchive'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { EmptyState } from '../ui/EmptyState'
import { SavedOutfitCard } from '../outfit/SavedOutfitCard'

export interface OutfitWallBoardProps {
  onOpenMirror: () => void
}

export function OutfitWallBoard({ onOpenMirror }: OutfitWallBoardProps) {
  const { savedOutfits, currentOutfit, saveOutfit, restoreOutfit, removeOutfit } =
    useArchive()

  const canSave = !isOutfitEmpty(currentOutfit)

  const handleRestore = (id: string) => {
    restoreOutfit(id)
    onOpenMirror()
  }

  const handleRemove = (id: string) => {
    const look = savedOutfits.find((o) => o.id === id)
    if (look && window.confirm(`Delete the look "${look.name}"?`)) {
      removeOutfit(id)
    }
  }

  return (
    <div className="section">
      <div className="section__head">
        <div>
          <div className="section__title">Saved Looks</div>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {savedOutfits.length} {savedOutfits.length === 1 ? 'look' : 'looks'}{' '}
            on the board
          </span>
        </div>
        <Button variant="primary" disabled={!canSave} onClick={() => saveOutfit('')}>
          <Icon name="plus" size={15} />
          Save current look
        </Button>
      </div>

      {savedOutfits.length === 0 ? (
        <EmptyState
          icon="outfits"
          title="Your look board is waiting"
          text="Build a fit in the Mirror, save it, and it pins here as an editorial look card you can restore anytime."
          actions={
            <Button variant="primary" onClick={onOpenMirror}>
              <Icon name="mirror" size={16} />
              Open the Mirror
            </Button>
          }
        />
      ) : (
        <div className="saved-grid">
          {savedOutfits.map((outfit, index) => (
            <SavedOutfitCard
              key={outfit.id}
              outfit={outfit}
              index={index}
              onRestore={handleRestore}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
