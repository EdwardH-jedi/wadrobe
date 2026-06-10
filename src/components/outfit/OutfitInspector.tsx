// Right-side inspector: the current outfit's slots, the Fit Check, and saving.
import { useState } from 'react'
import { isOutfitEmpty } from '../../domain/outfitTypes'
import { useArchive } from '../../app/providers/useArchive'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Panel } from '../ui/Panel'
import { CurrentFitSlots } from './CurrentFitSlots'
import { FitCheck } from './FitCheck'

export function OutfitInspector() {
  const { currentOutfit, clearOutfit, saveOutfit } = useArchive()
  const [name, setName] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  const empty = isOutfitEmpty(currentOutfit)

  const handleSave = () => {
    const saved = saveOutfit(name)
    if (saved) {
      setName('')
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 1800)
    }
  }

  return (
    <div className="inspector">
      <Panel
        title="Current fit"
        actions={
          !empty && (
            <Button size="sm" variant="quiet" onClick={clearOutfit}>
              Clear all
            </Button>
          )
        }
      >
        <CurrentFitSlots />
      </Panel>

      <Panel>
        <FitCheck />
      </Panel>

      <Panel title="Save this look">
        <div className="col" style={{ gap: 10 }}>
          <input
            className="field__input"
            value={name}
            placeholder="Name this look…"
            disabled={empty}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
          />
          <Button
            variant="primary"
            block
            disabled={empty}
            onClick={handleSave}
          >
            <Icon name={justSaved ? 'check' : 'layers'} size={16} />
            {justSaved ? 'Saved to the board' : 'Save look'}
          </Button>
          {empty && (
            <p className="muted" style={{ fontSize: 12 }}>
              Style at least one piece to save a look.
            </p>
          )}
        </div>
      </Panel>
    </div>
  )
}
