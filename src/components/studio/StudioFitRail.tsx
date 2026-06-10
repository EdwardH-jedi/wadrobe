// A compact, always-visible "Current Fit" rail for the Studio view, so the
// selected outfit is readable without opening the Mirror. Read-only: it reuses
// CurrentFitSlots (no clear buttons) and links into the Mirror for full styling.
import { OUTFIT_SLOT_ORDER, countFilledSlots, isOutfitEmpty } from '../../domain/outfitTypes'
import { useArchive } from '../../app/providers/useArchive'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { CurrentFitSlots } from '../outfit/CurrentFitSlots'

export interface StudioFitRailProps {
  onOpenMirror: () => void
}

export function StudioFitRail({ onOpenMirror }: StudioFitRailProps) {
  const { currentOutfit } = useArchive()
  const filled = countFilledSlots(currentOutfit)
  const empty = isOutfitEmpty(currentOutfit)

  return (
    <aside className="studio-fit" aria-label="Current fit">
      <div className="studio-fit__head">
        <span className="eyebrow">Current Fit</span>
        <span className="studio-fit__count">
          {filled}/{OUTFIT_SLOT_ORDER.length}
        </span>
      </div>

      <CurrentFitSlots compact />

      <Button variant="ghost" size="sm" block onClick={onOpenMirror}>
        <Icon name="mirror" size={15} />
        {empty ? 'Style in the Mirror' : 'Open the Mirror'}
      </Button>
    </aside>
  )
}
